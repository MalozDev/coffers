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
import { Account, Budget, ExpectedIncome, Goal, Reminder, Transaction, User } from "@/lib/models";
import { getAccountBalances } from "@/lib/utils/balances";

import type { FlowTotals, MetaEnvelope, PeriodAnalysis } from "./types";
import { resolvePeriod, scopeLabel } from "./periods";
import { buildPeriodAnalysis, type CategoryInput } from "./analysis";
import {
  buildForecast,
  elapsedDaysIn,
  type ForecastAccount,
  type ForecastCategory,
  type ForecastOutput,
  type ForecastTransaction,
} from "./forecast";
import { simulatePurchase, type SimulationInput, type SimulationOutput } from "./simulation";
import { detectPatterns, type PatternTransaction, type PatternsResult } from "./patterns";
import { answerQuestion, type AskSnapshot, type AskTx } from "./answers";

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

/** Expense amounts for the selected window, used to build a distribution histogram. */
async function expenseAmountsFor(userId: string, start: Date, end: Date): Promise<number[]> {
  const rows = await Transaction.find({
    userId: oid(userId),
    type: "expense",
    date: { $gte: start, $lte: end },
  })
    .select("amount -_id")
    .lean();
  return rows.map((row) => row.amount).filter((amount) => Number.isFinite(amount) && amount > 0);
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
  /** Individual expense amounts for the overview distribution histogram. */
  transactionAmounts: number[];
}

export async function analyzePeriod(
  userId: string,
  requested?: string | null,
  referenceDate?: Date | string | null,
  asOf: Date = new Date()
): Promise<MetaEnvelope<PeriodAnalysisPayload>> {
  const range = resolvePeriod(requested, referenceDate, asOf);

  const [balanceMap, current, previous, categories, transactionAmounts, savingsIds, committed] =
    await Promise.all([
      getAccountBalances(userId),
      flowsFor(userId, range.start, range.end),
      flowsFor(userId, range.prevStart, range.prevEnd),
      categoryBreakdownFor(userId, range.start, range.end),
      expenseAmountsFor(userId, range.start, range.end),
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
      transactionAmounts,
    },
    asOf
  );
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/forecast
 * ────────────────────────────────────────────────────────── */

export async function forecastForUser(
  userId: string,
  period?: string | null,
  referenceDate?: Date | string | null,
  asOf: Date = new Date()
): Promise<MetaEnvelope<ForecastOutput>> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEndEod = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59, 999);
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

  // The page's period filter paces the forecast — but an empty window can't
  // pace anything, so fall back to month-to-date and say so.
  const range = resolvePeriod(period, referenceDate, asOf);
  const coversFullMonth = range.start <= monthStart && range.end >= monthEndEod;
  const windowFlows = await flowsFor(
    userId,
    range.start,
    range.end < asOf ? range.end : asOf
  );
  const useMonthPace = windowFlows.count === 0 && !coversFullMonth;
  const scope = useMonthPace
    ? undefined
    : { label: range.label, start: range.start, end: range.end };
  const windowStart = useMonthPace ? monthStart : range.start;
  const paceEnd = useMonthPace ? monthEndEod : range.end;
  const windowEnd = paceEnd < asOf ? paceEnd : asOf;

  const [
    windowTransactions,
    accounts,
    balanceMap,
    categoryRows,
    prevMonthExpenses,
    perAccountWindow,
  ] = await Promise.all([
    Transaction.find({ userId, date: { $gte: windowStart, $lte: windowEnd } })
      .select("type amount date")
      .lean(),
    Account.find({ userId }).lean(),
    getAccountBalances(userId),
    Transaction.aggregate([
      {
        $match: {
          userId: oid(userId),
          type: "expense",
          date: { $gte: windowStart, $lte: windowEnd },
        },
      },
      { $group: { _id: "$categoryId", total: { $sum: "$amount" } } },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, total: 1, name: "$category.name" } },
    ]),
    flowsFor(userId, prevMonthStart, prevMonthEnd),
    Transaction.aggregate([
      { $match: { userId: oid(userId), date: { $gte: windowStart, $lte: windowEnd } } },
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
    perAccountWindow.map((row) => [String(row._id), row])
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

  const transactions: ForecastTransaction[] = windowTransactions.map((tx) => ({
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
    scope,
    scopeNote: useMonthPace
      ? `No activity in ${range.label} — pacing from month-to-date instead.`
      : undefined,
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
  /** Analysis period filter (window for income/expense figures). */
  period?: string | null;
  date?: Date | string | null;
}

export async function simulateForUser(
  userId: string,
  request: SimulationRequest,
  asOf: Date = new Date()
): Promise<MetaEnvelope<SimulationOutput>> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59, 999);

  const range = resolvePeriod(request.period, request.date, asOf);
  const coversFullMonth = range.start <= monthStart && range.end >= monthEnd;
  const rangeEnd = range.end < asOf ? range.end : asOf;
  const windowFlows = await flowsFor(userId, range.start, rangeEnd);
  // An empty window can't produce honest rates — fall back to month figures.
  const useMonthFigures = windowFlows.count === 0 && !coversFullMonth;
  const flowStart = useMonthFigures ? monthStart : range.start;
  const flowEnd = useMonthFigures ? asOf : rangeEnd;
  const effectiveLabel = useMonthFigures ? "this month" : scopeLabel(range, asOf);
  const scopeNote = useMonthFigures
    ? `No activity in ${range.label} — using month-to-date figures instead.`
    : undefined;

  const [balanceMap, expectedDocs, committedDocs, windowTransactions, goalDocs] =
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
      Transaction.find({ userId, date: { $gte: flowStart, $lte: flowEnd } })
        .select("type amount")
        .lean(),
      Goal.find({ userId, status: "active" }).lean(),
    ]);

  let windowIncome = 0;
  let windowExpenses = 0;
  for (const tx of windowTransactions) {
    if (tx.type === "income") windowIncome += tx.amount;
    else if (tx.type === "expense") windowExpenses += tx.amount;
  }

  const input: SimulationInput = {
    amount: request.amount,
    description: request.description,
    categoryId: request.categoryId,
    totalBalance: sum(balanceMap.values()),
    expectedIncome: expectedDocs.reduce((total, row) => total + row.amount, 0),
    committedExpenses: committedDocs.reduce((total, row) => total + row.amount, 0),
    monthIncome: windowIncome,
    monthExpenses: windowExpenses,
    dayOfMonth: elapsedDaysIn(flowStart, flowEnd, asOf),
    scopeLabel: effectiveLabel,
    goals: goalDocs.map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
    })),
  };

  return envelope({ ...simulatePurchase(input), scopeNote }, asOf);
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/patterns
 * ────────────────────────────────────────────────────────── */

export async function patternsForUser(
  userId: string,
  period?: string | null,
  referenceDate?: Date | string | null,
  asOf: Date = new Date()
): Promise<MetaEnvelope<PatternsResult>> {
  // Detection (recurring/payday/forgotten) always needs history; statistics
  // are scoped to the selected window via detectPatterns' third argument.
  const range = resolvePeriod(period, referenceDate, asOf);
  const lookback = new Date(asOf);
  lookback.setMonth(lookback.getMonth() - 3);
  const fetchFrom = range.prevStart < lookback ? range.prevStart : lookback;

  const transactions = await Transaction.find({ userId, date: { $gte: fetchFrom } })
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

  const result = detectPatterns(fixtures, asOf, range);
  return envelope(
    {
      ...result,
      window: { key: range.key, label: range.label, prevLabel: range.prevLabel },
    },
    asOf
  );
}

/* ────────────────────────────────────────────────────────── *
 *  /api/intelligence/ask — snapshot + router
 * ────────────────────────────────────────────────────────── */

export interface AskFilterInput {
  period?: string | null;
  date?: Date | string | null;
}

export async function buildAskSnapshot(
  userId: string,
  filter: AskFilterInput = {},
  asOf: Date = new Date()
): Promise<AskSnapshot> {
  const [balanceMap, accounts, expectedDocs, reminderDocs, goalDocs, budgetDocs, userDoc] =
    await Promise.all([
      getAccountBalances(userId),
      Account.find({ userId }).lean(),
      ExpectedIncome.find({ userId, status: "pending" }).select("amount").lean(),
      Reminder.find({ userId, isCompleted: false, dueDate: { $gte: asOf } })
        .sort({ dueDate: 1 })
        .lean(),
      Goal.find({ userId, status: "active" }).lean(),
      Budget.find({ userId }).select("name amount categoryId items").lean(),
      User.findById(userId).select("name").lean(),
    ]);

  const today = resolvePeriod("today", null, asOf);
  const yesterday = resolvePeriod("yesterday", null, asOf);
  const week = resolvePeriod("week", null, asOf);
  const month = resolvePeriod("month", null, asOf);

  // The window immediately before each preset — powers "more than last
  // week/month?" comparisons without a second round-trip.
  const prevDayStart = new Date(today.start);
  prevDayStart.setDate(prevDayStart.getDate() - 2);
  const prevWeekStart = new Date(week.start);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevMonthStart = new Date(month.start);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const justBefore = (start: Date) => new Date(start.getTime() - 1);

  const [todayFlows, yesterdayFlows, weekFlows, monthFlows, monthCategories, prevDayFlows, prevWeekFlows, prevMonthFlows] =
    await Promise.all([
      flowsFor(userId, today.start, today.end),
      flowsFor(userId, yesterday.start, yesterday.end),
      flowsFor(userId, week.start, week.end),
      flowsFor(userId, month.start, month.end),
      categoryBreakdownFor(userId, month.start, month.end),
      flowsFor(userId, prevDayStart, justBefore(today.start)),
      flowsFor(userId, prevWeekStart, justBefore(week.start)),
      flowsFor(userId, prevMonthStart, justBefore(month.start)),
    ]);

  const dayOfMonth = asOf.getDate();
  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const dailySpendRate = dayOfMonth > 0 ? monthFlows.expenses / dayOfMonth : 0;

  // The page's active period filter: Ask answers bare questions against it.
  const filterRange =
    filter.period || filter.date ? resolvePeriod(filter.period, filter.date, asOf) : null;
  const filterFlows = filterRange
    ? await flowsFor(userId, filterRange.start, filterRange.end)
    : null;

  // Recent transactions backing "list …" answers (itemised, not totals).
  const recentDocs = await Transaction.find({ userId })
    .sort({ date: -1, _id: -1 })
    .limit(500)
    .populate("categoryId", "name")
    .populate("accountId", "name")
    .lean();
  const recent: AskTx[] = recentDocs.map((tx) => ({
    type: tx.type as AskTx["type"],
    amount: tx.amount,
    date: tx.date,
    description: tx.description,
    category: (tx.categoryId as { name?: string } | null)?.name,
    account: (tx.accountId as { name?: string } | null)?.name,
  }));

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
        .reduce((total, item) => total + (Number(item.price) || 0), 0);
    }
    return { name: budget.name, amount: budget.amount, spent };
  });

  return {
    now: asOf,
    name: userDoc?.name || undefined,
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
    prevDay: prevDayFlows,
    prevWeek: prevWeekFlows,
    prevMonth: prevMonthFlows,
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
    filter:
      filterRange && filterFlows
        ? {
            key: filterRange.key,
            label: filterRange.label,
            start: filterRange.start,
            end: filterRange.end,
            flows: filterFlows,
          }
        : undefined,
    recent,
  };
}

export interface AskOptions extends AskFilterInput {
  /** Previous user questions, oldest first (conversation context). */
  history?: string[];
}

export interface AskResponse {
  question: string;
  answer: string;
  suggestions: string[];
  context: Record<string, unknown>;
  timestamp: string;
}

export async function ask(
  userId: string,
  question: string,
  options: AskOptions = {},
  asOf: Date = new Date()
): Promise<MetaEnvelope<AskResponse>> {
  const snapshot = await buildAskSnapshot(userId, options, asOf);
  const history = (options.history || [])
    .filter((entry): entry is string => typeof entry === "string")
    .slice(-12)
    .map((entry) => entry.slice(0, 300));
  const result = answerQuestion(question, snapshot, history);
  return envelope(
    {
      question,
      answer: result.answer,
      suggestions: result.suggestions || [],
      context: result.data,
      timestamp: asOf.toISOString(),
    },
    asOf
  );
}
