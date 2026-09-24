/*
 * Finance Engine — spending pattern detection (pure).
 *
 * Ported wholesale from the old /api/intelligence/patterns handler so the
 * route becomes a thin controller: fetch transactions → detectPatterns().
 * All window logic takes `now` as an argument (no hidden clock) so the
 * behaviour is reproducible under test.
 */

import type { PeriodInsight, PeriodRange } from "./types";
import { formatDayMonth, formatK, round } from "./format";
import { percentChange } from "./analysis";

export interface PatternCategoryRef {
  _id?: unknown;
  name?: string;
  color?: string;
  icon?: string;
}

export interface PatternTransaction {
  type: "income" | "expense" | "transfer";
  amount: number;
  date: Date | string;
  description?: string;
  categoryId?: PatternCategoryRef | string | null;
}

export interface RecurringExpense {
  description: string;
  categoryId: string;
  categoryName: string;
  count: number;
  avgAmount: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "irregular";
  avgDaysBetween: number;
  lastDate: string;
  nextPredictedDate: string;
  isUpcoming: boolean;
}

export interface PaydayPattern {
  detected: boolean;
  avgFirst5Days?: number;
  avgRestOfMonth?: number;
  insight?: string;
}

export interface SpendingTrend {
  direction: "increasing" | "decreasing" | "stable" | "insufficient_data";
  monthlyData: { month: string; total: number }[];
}

export interface CategoryChange {
  categoryId: string;
  name: string;
  current: number;
  previous: number;
  change: number;
}

export interface ForgottenExpense {
  description: string;
  categoryName: string;
  avgAmount: number;
  expectedDate: string;
  daysOverdue: number;
}

export interface PatternsResult {
  recurringExpenses: RecurringExpense[];
  paydayPattern: PaydayPattern;
  spendingTrend: SpendingTrend;
  categoryChanges: CategoryChange[];
  forgottenExpenses: ForgottenExpense[];
  healthIndicators: {
    savingsRate: number;
    spendingConsistency: string;
    categoryDiversification: string;
    recurringAwareness: string;
  };
  insights: string[];
  insightsDetailed: PeriodInsight[];
  /** Which analysis window these numbers were scoped to (set by the engine). */
  window?: { key: string; label: string; prevLabel: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-time period key ("2026-09") — never UTC, which can shift the month. */
function monthKey(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function categoryOf(tx: PatternTransaction): { id: string; name: string } {
  const ref = tx.categoryId;
  if (ref && typeof ref === "object") {
    return {
      id: ref._id ? String(ref._id) : "",
      name: ref.name || "Unknown",
    };
  }
  if (typeof ref === "string") return { id: ref, name: "Unknown" };
  return { id: "", name: "Unknown" };
}

function detectRecurring(
  expenses: PatternTransaction[],
  now: Date
): RecurringExpense[] {
  const byDescription: Record<
    string,
    { amounts: number[]; dates: Date[]; categoryId: string; categoryName: string }
  > = {};

  for (const tx of expenses) {
    const key = (tx.description || "").toLowerCase().trim();
    if (!key) continue;
    if (!byDescription[key]) {
      const category = categoryOf(tx);
      byDescription[key] = {
        amounts: [],
        dates: [],
        categoryId: category.id,
        categoryName: category.name,
      };
    }
    byDescription[key].amounts.push(tx.amount);
    byDescription[key].dates.push(new Date(tx.date));
  }

  return Object.entries(byDescription)
    .filter(([, entry]) => entry.amounts.length >= 2)
    .map(([description, entry]) => {
      const avgAmount =
        entry.amounts.reduce((a, b) => a + b, 0) / entry.amounts.length;

      const sortedDates = entry.dates.sort((a, b) => a.getTime() - b.getTime());
      let avgDaysBetween = 30;
      if (sortedDates.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < sortedDates.length; i++) {
          gaps.push((sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / DAY_MS);
        }
        avgDaysBetween = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }

      let frequency: RecurringExpense["frequency"] = "irregular";
      if (avgDaysBetween <= 2) frequency = "daily";
      else if (avgDaysBetween <= 9) frequency = "weekly";
      else if (avgDaysBetween <= 35) frequency = "monthly";
      else if (avgDaysBetween <= 400) frequency = "yearly";

      const lastDate = sortedDates[sortedDates.length - 1];
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + Math.round(avgDaysBetween));

      return {
        description,
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        count: entry.amounts.length,
        avgAmount: Math.round(avgAmount),
        frequency,
        avgDaysBetween: Math.round(avgDaysBetween),
        lastDate: lastDate.toISOString(),
        nextPredictedDate: nextDate.toISOString(),
        isUpcoming:
          nextDate.getTime() > now.getTime() &&
          nextDate.getTime() < now.getTime() + 7 * DAY_MS,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function detectPayday(
  transactions: PatternTransaction[],
  income: PatternTransaction[],
  now: Date
): PaydayPattern {
  const paydayDates = income.map((tx) => new Date(tx.date));
  if (paydayDates.length < 2) return { detected: false };

  const expenses = transactions.filter((t) => t.type === "expense");
  let earlySpending = 0;
  let earlyCount = 0;
  let lateSpending = 0;
  let lateCount = 0;

  for (const payday of paydayDates) {
    for (const expense of expenses) {
      const expenseDate = new Date(expense.date);
      const daysSince = (expenseDate.getTime() - payday.getTime()) / DAY_MS;
      if (daysSince >= 0 && daysSince <= 5) {
        earlySpending += expense.amount;
        earlyCount++;
      } else if (daysSince > 5 && daysSince <= 30) {
        lateSpending += expense.amount;
        lateCount++;
      }
    }
  }

  const avgEarly = earlyCount > 0 ? earlySpending / paydayDates.length : 0;
  const avgLate = lateCount > 0 ? lateSpending / paydayDates.length : 0;
  const normalizedLate = avgLate / 3; // ~5-day equivalent

  return {
    detected: true,
    avgFirst5Days: Math.round(avgEarly),
    avgRestOfMonth: Math.round(normalizedLate),
    insight:
      avgEarly > normalizedLate * 1.3
        ? `You spend ${Math.round((avgEarly / (normalizedLate || 1) - 1) * 100)}% more in the first 5 days after payday compared to the rest of the month.`
        : "Your spending is fairly consistent throughout the month.",
  };
}

function startOfDay(value: Date | string): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Trend direction. With a window: bucket the window adaptively — daily for
 * ≤14-day windows, weekly up to ~2 months, monthly beyond — zero-filling
 * gaps so "spending stopped" reads as falling, not missing. Without a
 * window: the original month-over-month comparison over all history.
 */
function detectTrend(
  expenses: PatternTransaction[],
  window?: PeriodRange
): SpendingTrend {
  if (window) {
    const DAY = 24 * 60 * 60 * 1000;
    const spanMs = window.end.getTime() - window.start.getTime();
    const spanDays = Math.max(1, Math.round(spanMs / DAY));
    // Buckets anchor at the window start so labels stay inside the window.
    const step = spanDays <= 14 ? DAY : spanDays <= 62 ? 7 * DAY : 30 * DAY;
    const lastIndex = Math.floor(spanMs / step);

    const totals = new Map<number, number>();
    for (let i = 0; i <= lastIndex; i++) totals.set(i, 0);
    for (const tx of expenses) {
      const date = new Date(tx.date);
      if (date < window.start || date > window.end) continue;
      const index = Math.min(
        lastIndex,
        Math.max(0, Math.floor((date.getTime() - window.start.getTime()) / step))
      );
      totals.set(index, (totals.get(index) || 0) + tx.amount);
    }

    const series = [...totals.entries()].sort(([a], [b]) => a - b);
    if (series.length < 2) return { direction: "insufficient_data", monthlyData: [] };
    const previous = series[series.length - 2][1];
    const current = series[series.length - 1][1];
    const labelFor = (index: number): string => {
      const bucketStart = new Date(window.start.getTime() + index * step);
      return step === 30 * DAY ? monthKey(bucketStart) : formatDayMonth(bucketStart);
    };
    return {
      direction: current > previous ? "increasing" : current < previous ? "decreasing" : "stable",
      monthlyData: series.map(([index, total]) => ({
        month: labelFor(index),
        total: Math.round(total),
      })),
    };
  }

  const monthlyTotals: Record<string, number> = {};
  for (const tx of expenses) {
    const key = monthKey(tx.date);
    monthlyTotals[key] = (monthlyTotals[key] || 0) + tx.amount;
  }

  const months = Object.entries(monthlyTotals).sort(([a], [b]) => a.localeCompare(b));
  if (months.length < 2) return { direction: "insufficient_data", monthlyData: [] };

  const lastMonth = months[months.length - 1][1];
  const previousMonth = months[months.length - 2][1];
  return {
    direction: lastMonth > previousMonth ? "increasing" : lastMonth < previousMonth ? "decreasing" : "stable",
    monthlyData: months.map(([month, total]) => ({ month, total: Math.round(total) })),
  };
}

function detectCategoryChanges(
  expenses: PatternTransaction[],
  now: Date,
  window?: PeriodRange
): CategoryChange[] {
  const currentMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const byCategory: Record<string, { current: number; previous: number; name: string }> = {};
  for (const tx of expenses) {
    if (!tx.categoryId) continue;
    const category = categoryOf(tx);
    if (!category.id) continue;
    if (!byCategory[category.id]) {
      byCategory[category.id] = { current: 0, previous: 0, name: category.name };
    }
    if (window) {
      const time = new Date(tx.date).getTime();
      if (time >= window.start.getTime() && time <= window.end.getTime()) {
        byCategory[category.id].current += tx.amount;
      } else if (
        time >= window.prevStart.getTime() &&
        time <= window.prevEnd.getTime()
      ) {
        byCategory[category.id].previous += tx.amount;
      }
      continue;
    }
    const key = monthKey(tx.date);
    if (key === currentMonth) byCategory[category.id].current += tx.amount;
    else if (key === lastMonth) byCategory[category.id].previous += tx.amount;
  }

  return Object.entries(byCategory)
    .filter(([, entry]) => entry.previous > 0)
    .map(([id, entry]) => ({
      categoryId: id,
      name: entry.name,
      current: Math.round(entry.current),
      previous: Math.round(entry.previous),
      change: percentChange(entry.current, entry.previous),
    }))
    .map((change) => ({ ...change, change: Math.round(change.change) }))
    .sort((a, b) => b.change - a.change);
}

function detectForgotten(
  recurring: RecurringExpense[],
  now: Date
): ForgottenExpense[] {
  return recurring
    .filter((entry) => {
      const lastDate = new Date(entry.lastDate);
      const daysSinceLast = (now.getTime() - lastDate.getTime()) / DAY_MS;
      return daysSinceLast > entry.avgDaysBetween * 1.2 && !entry.isUpcoming;
    })
    .map((entry) => ({
      description: entry.description,
      categoryName: entry.categoryName,
      avgAmount: entry.avgAmount,
      expectedDate: entry.nextPredictedDate,
      daysOverdue: Math.round(
        (now.getTime() - new Date(entry.nextPredictedDate).getTime()) / DAY_MS
      ),
    }));
}

function buildInsights(args: {
  recurring: RecurringExpense[];
  forgotten: ForgottenExpense[];
  trend: SpendingTrend;
  categoryChanges: CategoryChange[];
  health: PatternsResult["healthIndicators"];
  window?: PeriodRange;
}): PeriodInsight[] {
  const out: PeriodInsight[] = [];
  const add = (id: string, tone: PeriodInsight["tone"], text: string) => {
    out.push({ id, tone, text });
  };

  if (args.health.savingsRate < 0) {
    add(
      "deficit",
      "negative",
      "Across the tracked window you spent more than you earned."
    );
  } else if (args.health.savingsRate >= 20) {
    add(
      "savings-good",
      "positive",
      `You kept ${args.health.savingsRate}% of income across the tracked window.`
    );
  }

  const trendScope = args.window ? `within ${args.window.label}` : "month over month";
  if (args.trend.direction === "increasing") {
    add("trend-up", "warning", `Spending is rising ${trendScope}.`);
  } else if (args.trend.direction === "decreasing") {
    add("trend-down", "positive", `Spending is falling ${trendScope}.`);
  }

  if (args.forgotten.length > 0) {
    add(
      "forgotten",
      "warning",
      `${args.forgotten.length} usual expense(s) look overdue — worth checking.`
    );
  }

  if (args.recurring.length > 0) {
    let monthly = 0;
    for (const entry of args.recurring) {
      if (entry.frequency === "daily") monthly += entry.avgAmount * 30;
      else if (entry.frequency === "weekly") monthly += entry.avgAmount * 4;
      else if (entry.frequency === "monthly") monthly += entry.avgAmount;
      else if (entry.frequency === "yearly") monthly += entry.avgAmount / 12;
    }
    add(
      "recurring",
      "neutral",
      `${args.recurring.length} recurring expense(s) — roughly ${formatK(monthly)} per month.`
    );
  }

  const riser = args.categoryChanges[0];
  if (riser && riser.change >= 25) {
    add(
      "category-riser",
      "warning",
      `${riser.name} is up ${riser.change}% versus ${args.window ? args.window.prevLabel : "last month"}.`
    );
  }

  return out.slice(0, 5);
}

/**
 * @param transactions  History to detect over — recurring/payday/forgotten
 *                       need multi-period history regardless of the filter.
 * @param now            Injectable clock.
 * @param window         When present, every *statistic* (trend, category
 *                       changes, health, insights) is scoped to this analysis
 *                       window and its comparison window — so the analysis
 *                       page's period filter applies to this section too.
 */
export function detectPatterns(
  transactions: PatternTransaction[],
  now: Date = new Date(),
  window?: PeriodRange
): PatternsResult {
  const expenses = transactions.filter((t) => t.type === "expense");
  const income = transactions.filter((t) => t.type === "income");

  const inWindow = (tx: PatternTransaction): boolean => {
    if (!window) return true;
    const time = new Date(tx.date).getTime();
    return time >= window.start.getTime() && time <= window.end.getTime();
  };
  const windowExpenses = window ? expenses.filter(inWindow) : expenses;
  const windowIncome = window ? income.filter(inWindow) : income;

  const recurringExpenses = detectRecurring(expenses, now);
  const paydayPattern = detectPayday(transactions, income, now);
  const spendingTrend = detectTrend(expenses, window);
  const categoryChanges = detectCategoryChanges(expenses, now, window);
  const forgottenExpenses = detectForgotten(recurringExpenses, now);

  const totalIncome = windowIncome.reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = windowExpenses.reduce((sum, t) => sum + t.amount, 0);

  const healthIndicators = {
    savingsRate:
      totalIncome > 0
        ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)
        : 0,
    spendingConsistency:
      spendingTrend.direction === "stable"
        ? "Good"
        : spendingTrend.direction === "decreasing"
          ? "Improving"
          : spendingTrend.direction === "insufficient_data"
            ? "Building history"
            : "Needs attention",
    categoryDiversification:
      new Set(
        windowExpenses.map((t) => categoryOf(t).id).filter(Boolean)
      ).size > 3
        ? "Diversified"
        : "Concentrated",
    recurringAwareness:
      recurringExpenses.length > 0 ? "Tracking" : "None detected",
  };

  const insightsDetailed = buildInsights({
    recurring: recurringExpenses,
    forgotten: forgottenExpenses,
    trend: spendingTrend,
    categoryChanges,
    health: healthIndicators,
    window,
  });

  return {
    recurringExpenses,
    paydayPattern,
    spendingTrend,
    categoryChanges,
    forgottenExpenses,
    healthIndicators,
    insights: insightsDetailed.map((insight) => insight.text),
    insightsDetailed,
  };
}
