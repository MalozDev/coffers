/*
 * Finance Engine — month-end forecast (pure).
 *
 * Linear, defensible projections: burn rate so far this month, category
 * pace, per-account projection, weekly buckets, and balance runway.
 * No database access — the data layer feeds it.
 */

import type { PeriodInsight } from "./types";
import { formatK, monthLabel, round } from "./format";
import { percentChange } from "./analysis";

export interface ForecastTransaction {
  date: Date | string;
  type: "income" | "expense" | "transfer";
  amount: number;
}

export interface ForecastAccount {
  name: string;
  type: string;
  /** Full current balance (derived from the transaction log). */
  currentBalance: number;
  monthIncome: number;
  monthExpense: number;
}

export interface ForecastCategory {
  categoryId: string;
  name: string;
  currentSpend: number;
}

export interface ForecastInput {
  now: Date;
  /** Transactions dated this month and <= now. */
  transactions: ForecastTransaction[];
  accounts: ForecastAccount[];
  /** Expense totals per category for this month. */
  categories: ForecastCategory[];
  /** Total expenses in the previous calendar month (pace comparison). */
  prevMonthExpenses?: number;
}

export interface CategoryProjection {
  categoryId: string;
  name: string;
  currentSpend: number;
  projectedMonthEnd: number;
  dailyRate: number;
}

export interface AccountProjection {
  name: string;
  type: string;
  currentBalance: number;
  projectedMonthEnd: number;
}

export interface WeekBucket {
  week: string;
  spending: number;
  income: number;
}

export interface ForecastOutput {
  current: {
    dayOfMonth: number;
    daysInMonth: number;
    daysRemaining: number;
    income: number;
    expenses: number;
    dailySpendRate: number;
    dailyIncomeRate: number;
  };
  projected: {
    income: number;
    expenses: number;
    savings: number;
    savingsRate: number;
  };
  categoryProjections: CategoryProjection[];
  accountProjections: AccountProjection[];
  weeklyBreakdown: WeekBucket[];
  /** Days until the combined balance hits zero at the current net burn. */
  runwayDays: number | null;
  insights: string[];
  insightsDetailed: PeriodInsight[];
}

function shiftDays(value: Date, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

function endOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** One bucket per calendar week of the month, clipped to `now`. */
export function buildWeeklyBreakdown(
  transactions: ForecastTransaction[],
  monthStart: Date,
  monthEnd: Date,
  now: Date
): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  let cursor = new Date(monthStart);
  let index = 1;

  while (cursor <= monthEnd && index <= 6) {
    const bucketStart = new Date(cursor);
    const rawEnd = endOfDay(shiftDays(bucketStart, 6));
    const bucketEnd = rawEnd > now ? now : rawEnd;

    let spending = 0;
    let income = 0;
    if (bucketStart <= bucketEnd) {
      for (const tx of transactions) {
        const date = new Date(tx.date);
        if (date < bucketStart || date > bucketEnd) continue;
        if (tx.type === "expense") spending += tx.amount;
        else if (tx.type === "income") income += tx.amount;
      }
    }

    buckets.push({
      week: `Week ${index}`,
      spending: Math.round(spending),
      income: Math.round(income),
    });
    cursor = shiftDays(bucketStart, 7);
    index += 1;
  }

  return buckets;
}

interface ForecastInsightArgs {
  now: Date;
  dayOfMonth: number;
  daysRemaining: number;
  dailySpendRate: number;
  projectedExpenses: number;
  projectedIncome: number;
  projectedSavings: number;
  categories: CategoryProjection[];
  prevMonthExpenses?: number;
  runwayDays: number | null;
  dailyNet: number;
}

export function buildForecastInsights(args: ForecastInsightArgs): PeriodInsight[] {
  const out: PeriodInsight[] = [];
  const add = (id: string, tone: PeriodInsight["tone"], text: string) => {
    out.push({ id, tone, text });
  };

  const projectedRate =
    args.projectedIncome > 0
      ? (args.projectedSavings / args.projectedIncome) * 100
      : 0;

  if (args.daysRemaining > 0) {
    add(
      "pace",
      "neutral",
      `At K${Math.round(args.dailySpendRate)}/day you'll spend about ${formatK(args.projectedExpenses)} by month-end.`
    );
  }

  if (args.projectedSavings < 0) {
    add(
      "projected-overspend",
      "warning",
      `Projected to overspend by ${formatK(args.projectedSavings)} this month.`
    );
  } else if (args.projectedSavings > 0 && args.projectedIncome > 0) {
    add(
      "projected-savings",
      "positive",
      `On track to save ${formatK(args.projectedSavings)} this month (${round(projectedRate)}% rate).`
    );
  }

  // Compare the projection with the real previous calendar month — but not
  // on day 1-2, when a single coffee skews the whole projection.
  const prev = args.prevMonthExpenses ?? 0;
  if (prev > 0 && args.dayOfMonth >= 3) {
    const change = percentChange(args.projectedExpenses, prev);
    const prevLabel = monthLabel(
      new Date(args.now.getFullYear(), args.now.getMonth() - 1, 1)
    );
    if (change >= 15) {
      add(
        "vs-last-month",
        "warning",
        `Projected spending is ${round(change)}% above ${prevLabel}.`
      );
    } else if (change <= -15) {
      add(
        "vs-last-month",
        "positive",
        `Projected spending is ${round(Math.abs(change))}% below ${prevLabel}.`
      );
    }
  }

  const top = args.categories[0];
  if (top && top.projectedMonthEnd > 0) {
    add(
      "top-projection",
      "neutral",
      `Highest projected expense: ${top.name} at ${formatK(top.projectedMonthEnd)}.`
    );
  }

  if (args.runwayDays !== null && args.dailyNet < 0) {
    if (args.runwayDays <= 30) {
      add(
        "runway",
        "warning",
        `Spending exceeds income — at this pace your balance lasts about ${args.runwayDays} day(s).`
      );
    } else {
      add(
        "runway",
        "neutral",
        `At the current net burn your balance covers about ${args.runwayDays} days.`
      );
    }
  }

  return out.slice(0, 5);
}

export function buildForecast(input: ForecastInput): ForecastOutput {
  const { now } = input;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dayOfMonth = now.getDate();
  const daysInMonth = monthEnd.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const safeDay = Math.max(dayOfMonth, 1);

  let income = 0;
  let expenses = 0;
  for (const tx of input.transactions) {
    if (tx.type === "income") income += tx.amount;
    else if (tx.type === "expense") expenses += tx.amount;
  }

  const dailySpendRate = expenses / safeDay;
  const dailyIncomeRate = income / safeDay;
  const projectedExpenses = dailySpendRate * daysInMonth;
  const projectedIncome = dailyIncomeRate * daysInMonth;
  const projectedSavings = projectedIncome - projectedExpenses;
  const projectedRate =
    projectedIncome > 0 ? (projectedSavings / projectedIncome) * 100 : 0;

  const categoryProjections: CategoryProjection[] = input.categories
    .map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
      currentSpend: Math.round(category.currentSpend),
      dailyRate: round(category.currentSpend / safeDay, 2),
      projectedMonthEnd: Math.round((category.currentSpend / safeDay) * daysInMonth),
    }))
    .sort((a, b) => b.projectedMonthEnd - a.projectedMonthEnd);

  const accountProjections: AccountProjection[] = input.accounts.map((account) => ({
    name: account.name,
    type: account.type,
    currentBalance: Math.round(account.currentBalance),
    projectedMonthEnd: Math.round(
      account.currentBalance +
        ((account.monthIncome - account.monthExpense) / safeDay) * daysRemaining
    ),
  }));

  const weeklyBreakdown = buildWeeklyBreakdown(
    input.transactions,
    monthStart,
    monthEnd,
    now
  );

  const totalBalance = input.accounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0
  );
  const dailyNet = (income - expenses) / safeDay;
  const runwayDays =
    dailyNet < 0 && dayOfMonth > 0
      ? Math.max(0, Math.floor(totalBalance / -dailyNet))
      : null;

  const insightsDetailed = buildForecastInsights({
    now,
    dayOfMonth,
    daysRemaining,
    dailySpendRate,
    projectedExpenses,
    projectedIncome,
    projectedSavings,
    categories: categoryProjections,
    prevMonthExpenses: input.prevMonthExpenses,
    runwayDays,
    dailyNet,
  });

  return {
    current: {
      dayOfMonth,
      daysInMonth,
      daysRemaining,
      income: Math.round(income),
      expenses: Math.round(expenses),
      dailySpendRate: Math.round(dailySpendRate),
      dailyIncomeRate: Math.round(dailyIncomeRate),
    },
    projected: {
      income: Math.round(projectedIncome),
      expenses: Math.round(projectedExpenses),
      savings: Math.round(projectedSavings),
      savingsRate: Math.round(projectedRate),
    },
    categoryProjections,
    accountProjections,
    weeklyBreakdown,
    runwayDays,
    insights: insightsDetailed.map((insight) => insight.text),
    insightsDetailed,
  };
}
