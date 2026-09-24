/*
 * Finance Engine — data-layer orchestration (docs/ask-engine.md §2).
 *
 * The ONLY module under lib/finance/ that talks to MongoDB. Routes call
 * these functions; these functions call the pure builders (periods,
 * analysis, forecast, simulation, patterns, answers). The dashboard and
 * Ask Coffers therefore share one source of truth for all math, and every
 * result carries its freshness envelope (§3.7).
 */

import { Types } from "mongoose";
import { Account, Budget, ExpectedIncome, Goal, Reminder, Transaction } from "@/lib/models";
import { getAccountBalances } from "@/lib/utils/balances";

import type { FlowTotals, MetaEnvelope, PeriodAnalysis } from "./types";
import { resolvePeriod } from "./periods";
import { buildPeriodAnalysis, type CategoryInput } from "./analysis";
import {
  buildForecast,
  type ForecastAccount,
  type ForecastCategory,
  type ForecastOutput,
  type ForecastTransaction,
} from "./forecast";
import { simulatePurchase, type SimulationInput, type SimulationOutput } from "./simulation";
import { detectPatterns, type PatternTransaction, type PatternsResult } from "./patterns";
import { answerQuestion, type AskSnapshot } from "./answers";

function envelope<T>(
  data: T,
  asOf: Date,
  source: "live" | "materialized" | "snapshot" = "live"
): MetaEnvelope<T> {
  return { data, meta: { asOf: asOf.toISOString(), source, stale: false } };
}

function oid(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId);
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/* ────────────────────────────────────────────────────────── *
 *  Shared query primitives
 * ────────────────────────────────────────────────────────── */

/** Income/expense totals for an inclusive window, aggregated in MongoDB. */
async function flowsFor(userId: string, start: Date, end: Date): Promise<FlowTotals> {
  const rows: { _id: string; total: number; count: number }[] = await Transaction.aggregate([
    { $match: { userId: oid(userId), date: { $gte: start, $lte: end } } },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const byType = new Map(rows.map((row) => [row._id, row]));
  const income = byType.get("income");
  const expense = byType.get("expense");
  return {
    income: income?.total || 0,
    expenses: expense?.total || 0,
    count: rows.reduce((total, row) => total + row.count, 0),
    incomeCount: income?.count || 0,
    expenseCount: expense?.count || 0,
  };
}

/** Expense totals per category for an inclusive window. */
async function categoryBreakdownFor(
  userId: string,
  start: Date,
  end: Date
): Promise<CategoryInput[]> {
  const rows = await Transaction.aggregate([
    { $match: { userId: oid(userId), type: "expense", date: { $gte: start, $lte: end } } },
    { $group: { _id: "$categoryId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        total: 1,
        count: 1,
        name: "$category.name",
        color: "$category.color",
        icon: "$category.icon",
      },
    },
  ]);
  return rows.map((row) => ({
    categoryId: row._id ? String(row._id) : null,
    name: row.name || "Other",
    color: row.color || undefined,
    icon: row.icon || undefined,
    total: row.total,
    count: row.count,
  }));
}

async function savingsAccountIds(userId: string): Promise<Types.ObjectId[]> {
  const accounts = await Account.find({ userId, type: "savings" }).select("_id").lean();
  return accounts.map((account) => account._id as Types.ObjectId);
}

/**
 * Net movement INTO savings accounts during a window — the same number the
 * analysis page has always called "Saved" (split payments included).
 */
async function savingsMovementFor(
  userId: string,
  savingsIds: Types.ObjectId[],
  start: Date,
  end: Date
): Promise<number> {
  if (savingsIds.length === 0) return 0;
  const savingsSet = new Set(savingsIds.map(String));
  const transactions = await Transaction.find({
    userId,
    date: { $gte: start, $lte: end },
    $or: [{ accountId: { $in: savingsIds } }, { toAccountId: { $in: savingsIds } }],
  })
    .select("type amount accountId toAccountId payments")
    .lean();

  let movement = 0;
  for (const tx of transactions) {
    const fromSavings = tx.accountId ? savingsSet.has(String(tx.accountId)) : false;
    const toSavings = tx.toAccountId ? savingsSet.has(String(tx.toAccountId)) : false;
    if (tx.type === "income" && fromSavings) {
      movement += tx.amount;
    } else if (tx.type === "expense") {
      if (tx.payments && tx.payments.length > 0) {
        movement -= tx.payments
          .filter((payment) => savingsSet.has(String(payment.accountId)))
          .reduce((total, payment) => total + payment.amount, 0);
      } else if (fromSavings) {
        movement -= tx.amount;
      }
    } else if (tx.type === "transfer" && fromSavings && !toSavings) {
      movement -= tx.amount;
    } else if (tx.type === "transfer" && toSavings && !fromSavings) {
      movement += tx.amount;
    }
  }
  return movement;
}

/** Reminders due between now and `days` from now. */
async function committedWithin(
  userId: string,
  asOf: Date,
  days: number
): Promise<number> {
  const horizon = new Date(asOf.getTime() + days * 24 * 60 * 60 * 1000);
  const rows = await Reminder.find({
    userId,
    isCompleted: false,
    dueDate: { $gte: asOf, $lte: horizon },
  })
    .select("amount")
    .lean();
  return rows.reduce((total, row) => total + row.amount, 0);
}

/* ────────────────────────────────────────────────────────── *
 *  /api/analysis — period analysis + insights
 * ────────────────────────────────────────────────────────── */

export interface PeriodAnalysisPayload extends PeriodAnalysis {
  dateRange: { start: Date; end: Date; prevStart: Date; prevEnd: Date };
  allTime: { income: number; expenses: number };
  savingsTotal: number;
}

export async function analyzePeriod(
  userId: string,
  requested?: string | null,
  referenceDate?: Date | string | null,
  asOf: Date = new Date()
): Promise<MetaEnvelope<PeriodAnalysisPayload>> {
  const range = resolvePeriod(requested, referenceDate, asOf);

  const [balanceMap, current, previous, categories, savingsIds, committed] =
    await Promise.all([
      getAccountBalances(userId),
      flowsFor(userId, range.start, range.end),
      flowsFor(userId, range.prevStart, range.prevEnd),
      categoryBreakdownFor(userId, range.start, range.end),
      savingsAccountIds(userId),
      committedWithin(userId, asOf, 7),
    ]);

  const [currentSavings, previousSavings, allTime] = await Promise.all([
    savingsMovementFor(userId, savingsIds, range.start, range.end),
    savingsMovementFor(userId, savingsIds, range.prevStart, range.prevEnd),
    flowsFor(userId, new Date(0), asOf),
  ]);

  const totalBalance = sum(balanceMap.values());
  let savingsTotal = 0;
  for (const accountId of savingsIds) {
    savingsTotal += balanceMap.get(String(accountId)) || 0;
  }

  const analysis = buildPeriodAnalysis({
    range,
    current,
    previous,
    currentSavings,
    previousSavings,
    categories,
    totalBalance,
    committedSoon: committed,
  });

  return envelope(
    {
      ...analysis,
      dateRange: {
        start: range.start,
        end: range.end,
        prevStart: range.prevStart,
        prevEnd: range.prevEnd,
      },
      allTime: { income: allTime.income, expenses: allTime.expenses },
      savingsTotal,
    },
    asOf
  );
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/forecast
 * ────────────────────────────────────────────────────────── */

export async function forecastForUser(
  userId: string,
  asOf: Date = new Date()
): Promise<MetaEnvelope<ForecastOutput>> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const prevMonthStart = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  const prevMonthEnd = new Date(
    asOf.getFullYear(),
    asOf.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  const [
    monthTransactions,
    accounts,
    balanceMap,
    categoryRows,
    prevMonthExpenses,
    perAccountMonth,
  ] = await Promise.all([
    Transaction.find({ userId, date: { $gte: monthStart, $lte: asOf } })
      .select("type amount date")
      .lean(),
    Account.find({ userId }).lean(),
    getAccountBalances(userId),
    Transaction.aggregate([
      {
        $match: {
          userId: oid(userId),
          type: "expense",
          date: { $gte: monthStart, $lte: asOf },
        },
      },
      { $group: { _id: "$categoryId", total: { $sum: "$amount" } } },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, total: 1, name: "$category.name" } },
    ]),
    flowsFor(userId, prevMonthStart, prevMonthEnd),
    Transaction.aggregate([
      { $match: { userId: oid(userId), date: { $gte: monthStart, $lte: asOf } } },
      {
        $group: {
          _id: "$accountId",
          income: {
            $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
          },
          expense: {
            $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
          },
        },
      },
    ]),
  ]);

  const monthFlowsById = new Map(
    perAccountMonth.map((row) => [String(row._id), row])
  );

  const forecastAccounts: ForecastAccount[] = accounts.map((account) => {
    const flows = monthFlowsById.get(String(account._id)) || { income: 0, expense: 0 };
    return {
      name: account.name,
      type: account.type,
      currentBalance: balanceMap.get(String(account._id)) ?? account.openingBalance,
      monthIncome: flows.income,
      monthExpense: flows.expense,
    };
  });

  const categories: ForecastCategory[] = categoryRows.map((row) => ({
    categoryId: row._id ? String(row._id) : "unknown",
    name: row.name || "Other",
    currentSpend: row.total,
  }));

  const transactions: ForecastTransaction[] = monthTransactions.map((tx) => ({
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
  }));

  const output = buildForecast({
    now: asOf,
    transactions,
    accounts: forecastAccounts,
    categories,
    prevMonthExpenses: prevMonthExpenses.expenses,
  });

  return envelope(output, asOf);
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/simulate — read-only working copy (§3.5)
 * ────────────────────────────────────────────────────────── */

export interface SimulationRequest {
  amount: number;
  description?: string;
  categoryId?: string;
}

export async function simulateForUser(
  userId: string,
  request: SimulationRequest,
  asOf: Date = new Date()
): Promise<MetaEnvelope<SimulationOutput>> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59, 999);

  const [balanceMap, expectedDocs, committedDocs, monthTransactions, goalDocs] =
    await Promise.all([
      getAccountBalances(userId),
      ExpectedIncome.find({ userId, status: "pending", expectedDate: { $gte: asOf } })
        .select("amount")
        .lean(),
      Reminder.find({
        userId,
        isCompleted: false,
        dueDate: { $gte: asOf, $lte: monthEnd },
      })
        .select("amount")
        .lean(),
      Transaction.find({ userId, date: { $gte: monthStart, $lte: asOf } })
        .select("type amount")
        .lean(),
      Goal.find({ userId, status: "active" }).lean(),
    ]);

  let monthIncome = 0;
  let monthExpenses = 0;
  for (const tx of monthTransactions) {
    if (tx.type === "income") monthIncome += tx.amount;
    else if (tx.type === "expense") monthExpenses += tx.amount;
  }

  const input: SimulationInput = {
    amount: request.amount,
    description: request.description,
    categoryId: request.categoryId,
    totalBalance: sum(balanceMap.values()),
    expectedIncome: expectedDocs.reduce((total, row) => total + row.amount, 0),
    committedExpenses: committedDocs.reduce((total, row) => total + row.amount, 0),
    monthIncome,
    monthExpenses,
    dayOfMonth: asOf.getDate(),
    goals: goalDocs.map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
    })),
  };

  return envelope(simulatePurchase(input), asOf);
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/patterns
 * ────────────────────────────────────────────────────────── */

export async function patternsForUser(
  userId: string,
  asOf: Date = new Date()
): Promise<MetaEnvelope<PatternsResult>> {
  const windowStart = new Date(asOf);
  windowStart.setMonth(windowStart.getMonth() - 3);

  const transactions = await Transaction.find({ userId, date: { $gte: windowStart } })
    .populate("categoryId", "name color icon")
    .sort({ date: 1 })
    .lean();

  const fixtures: PatternTransaction[] = transactions.map((tx) => ({
    type: tx.type,
    amount: tx.amount,
    date: tx.date,
    description: tx.description,
    categoryId: tx.categoryId as PatternTransaction["categoryId"],
  }));

  return envelope(detectPatterns(fixtures, asOf), asOf);
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/ask — snapshot + router
 * ────────────────────────────────────────────────────────── */

export async function buildAskSnapshot(
  userId: string,
  asOf: Date = new Date()
): Promise<AskSnapshot> {
  const [balanceMap, accounts, expectedDocs, reminderDocs, goalDocs, budgetDocs] =
    await Promise.all([
      getAccountBalances(userId),
      Account.find({ userId }).lean(),
      ExpectedIncome.find({ userId, status: "pending" }).select("amount").lean(),
      Reminder.find({ userId, isCompleted: false, dueDate: { $gte: asOf } })
        .sort({ dueDate: 1 })
        .lean(),
      Goal.find({ userId, status: "active" }).lean(),
      Budget.find({ userId }).select("name amount categoryId items").lean(),
    ]);

  const today = resolvePeriod("today", null, asOf);
  const yesterday = resolvePeriod("yesterday", null, asOf);
  const week = resolvePeriod("week", null, asOf);
  const month = resolvePeriod("month", null, asOf);

  const [todayFlows, yesterdayFlows, weekFlows, monthFlows, monthCategories] =
    await Promise.all([
      flowsFor(userId, today.start, today.end),
      flowsFor(userId, yesterday.start, yesterday.end),
      flowsFor(userId, week.start, week.end),
      flowsFor(userId, month.start, month.end),
      categoryBreakdownFor(userId, month.start, month.end),
    ]);

  const dayOfMonth = asOf.getDate();
  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const dailySpendRate = dayOfMonth > 0 ? monthFlows.expenses / dayOfMonth : 0;

  const budgets = budgetDocs.map((budget) => {
    let spent = 0;
    if (budget.categoryId) {
      const match = monthCategories.find(
        (category) => category.categoryId === String(budget.categoryId)
      );
      spent = match ? match.total : 0;
    } else if (budget.items && budget.items.length > 0) {
      spent = budget.items
        .filter((item) => item.bought)
        .reduce((total, item) => total + item.price, 0);
    }
    return { name: budget.name, amount: budget.amount, spent };
  });

  return {
    now: asOf,
    balance: {
      total: sum(balanceMap.values()),
      accounts: accounts.map((account) => ({
        name: account.name,
        balance: balanceMap.get(String(account._id)) ?? account.openingBalance,
      })),
    },
    expectedIncome: expectedDocs.reduce((total, row) => total + row.amount, 0),
    committed: {
      total: reminderDocs.reduce((total, row) => total + row.amount, 0),
      items: reminderDocs.map((reminder) => ({
        title: reminder.title,
        amount: reminder.amount,
        dueDate: reminder.dueDate,
      })),
    },
    periods: {
      today: todayFlows,
      yesterday: yesterdayFlows,
      week: weekFlows,
      month: monthFlows,
    },
    categoriesThisMonth: monthCategories.map((category) => ({
      name: category.name || "Other",
      total: category.total,
    })),
    goals: goalDocs.map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
    })),
    budgets,
    month: {
      income: monthFlows.income,
      expenses: monthFlows.expenses,
      dayOfMonth,
      daysInMonth,
      dailySpendRate,
      projectedMonthEnd: dailySpendRate * daysInMonth,
    },
  };
}

export interface AskResponse {
  question: string;
  answer: string;
  context: Record<string, unknown>;
  timestamp: string;
}

export async function ask(
  userId: string,
  question: string,
  asOf: Date = new Date()
): Promise<MetaEnvelope<AskResponse>> {
  const snapshot = await buildAskSnapshot(userId, asOf);
  const result = answerQuestion(question, snapshot);
  return envelope(
    {
      question,
      answer: result.answer,
      context: result.data,
      timestamp: asOf.toISOString(),
    },
    asOf
  );
}
