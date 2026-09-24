/*
 * Finance Engine — period analysis + the insight rules (pure).
 *
 * This is where "what happened" becomes "what it means". The rules are
 * deterministic: same input always produces the same insights, so the
 * dashboard and Ask Coffers can never disagree (docs/ask-engine.md §1).
 */

import type {
  CategoryShare,
  FlowTotals,
  PeriodAnalysis,
  PeriodInsight,
  PeriodMetrics,
  PeriodRange,
} from "./types";
import { formatK, round } from "./format";

export interface CategoryInput {
  categoryId: string | null;
  name?: string | null;
  color?: string;
  icon?: string;
  total: number;
  count: number;
}

export interface PeriodAnalysisInput {
  range: PeriodRange;
  current: FlowTotals;
  previous: FlowTotals;
  /** Net movement INTO savings accounts during each window. */
  currentSavings: number;
  previousSavings: number;
  categories: CategoryInput[];
  /** Sum of all account balances — feeds the low-buffer insight. */
  totalBalance?: number | null;
  /** Reminders due within the comparison horizon (e.g. next 7 days). */
  committedSoon?: number | null;
}

export interface OverviewInsightInput {
  label: string;
  prevLabel: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  categories: CategoryShare[];
  progress: number;
  totalBalance?: number | null;
  committedSoon?: number | null;
}

const EMPTY_FLOWS: FlowTotals = {
  income: 0,
  expenses: 0,
  count: 0,
  incomeCount: 0,
  expenseCount: 0,
};

export function emptyFlows(): FlowTotals {
  return { ...EMPTY_FLOWS };
}

/** Derive the metrics an insight reasons about from raw flow totals. */
export function metricsFrom(flows: FlowTotals, savings: number): PeriodMetrics {
  return {
    ...flows,
    savings,
    savingsRate: flows.income > 0 ? (savings / flows.income) * 100 : 0,
    net: flows.income - flows.expenses,
    avgTransaction:
      flows.expenseCount > 0 ? flows.expenses / flows.expenseCount : 0,
  };
}

/** Percentage change; 0 when there is no meaningful baseline. */
export function percentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

/** Normalise + sort category spending, with each category's share. */
export function buildCategoryShares(categories: CategoryInput[]): CategoryShare[] {
  const total = categories.reduce((sum, category) => sum + category.total, 0);
  return categories
    .map((category) => ({
      categoryId: category.categoryId,
      name: category.name || "Other",
      color: category.color,
      icon: category.icon,
      total: category.total,
      count: category.count,
      percentage: total > 0 ? (category.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * The overview insight rules. Ordered by financial importance so the cap
 * never drops a warning that matters (balance risk > pace > trivia).
 */
export function buildOverviewInsights(
  input: OverviewInsightInput
): PeriodInsight[] {
  const { label, prevLabel, current, previous, categories, progress } = input;
  const out: PeriodInsight[] = [];
  const add = (id: string, tone: PeriodInsight["tone"], text: string) => {
    out.push({ id, tone, text });
  };

  const noActivity = current.income === 0 && current.expenses === 0;
  if (noActivity) {
    add("no-activity", "neutral", "No income or spending recorded for this period.");
  }

  // Spending vs the previous window of the same shape.
  if (previous.expenses > 0) {
    const change = percentChange(current.expenses, previous.expenses);
    if (change >= 15) {
      add(
        "expense-up",
        "negative",
        `Spending rose ${round(change)}% versus ${prevLabel} (${formatK(previous.expenses)} → ${formatK(current.expenses)}).`
      );
    } else if (change <= -15) {
      add(
        "expense-down",
        "positive",
        `Spending fell ${round(Math.abs(change))}% versus ${prevLabel} — nice work.`
      );
    }
  }

  // Income swing (only when meaningful on both sides).
  if (previous.income > 0) {
    const change = percentChange(current.income, previous.income);
    if (change >= 25) {
      add("income-up", "positive", `Income rose ${round(change)}% versus ${prevLabel}.`);
    } else if (change <= -25) {
      add("income-down", "warning", `Income fell ${round(Math.abs(change))}% versus ${prevLabel}.`);
    }
  }

  // Deficit beats rate talk; otherwise judge the savings rate.
  if (current.income > 0 && current.net < 0) {
    add(
      "deficit",
      "negative",
      `Spending exceeded income by ${formatK(current.net)} this period — you are running a deficit.`
    );
  } else if (current.income > 0) {
    if (current.savingsRate >= 20) {
      add(
        "savings-good",
        "positive",
        `You kept ${round(current.savingsRate)}% of your income — above the 20% target.`
      );
    } else if (current.savingsRate < 10) {
      add(
        "savings-low",
        "warning",
        `Only ${round(current.savingsRate)}% of income was set aside — the healthy target is 20%.`
      );
    }
  }

  // Balance risk: commitments larger than the money on hand.
  const committed = input.committedSoon ?? 0;
  const balance = input.totalBalance;
  if (committed > 0 && balance !== null && balance !== undefined && balance < committed) {
    add(
      "balance-buffer",
      "warning",
      `Upcoming commitments (${formatK(committed)}) exceed your available balance (${formatK(balance)}).`
    );
  }

  // Pace projection — only meaningful part-way through a longer window.
  if (previous.expenses > 0 && progress > 0.05 && progress < 0.95) {
    const projected = current.expenses / progress;
    const diff = projected - previous.expenses;
    const vsPrevious = diff / previous.expenses;
    if (vsPrevious >= 0.15) {
      add(
        "pace-up",
        "warning",
        `At the current pace this period lands near ${formatK(projected)} — ${formatK(diff)} more than ${prevLabel}.`
      );
    } else if (vsPrevious <= -0.15) {
      add(
        "pace-down",
        "positive",
        `At the current pace this period lands near ${formatK(projected)} — ${formatK(diff)} less than ${prevLabel}.`
      );
    }
  }

  // Concentration risk in spending.
  const top = categories[0];
  if (!noActivity && top && top.percentage >= 30) {
    add(
      "top-category",
      "neutral",
      `${top.name} absorbed ${round(top.percentage)}% of spending (${formatK(top.total)}).`
    );
  }

  // Cap keeps the card scannable; ordering already put warnings first.
  return out.slice(0, 6);
}

/** Build the full period analysis served by /api/analysis. */
export function buildPeriodAnalysis(input: PeriodAnalysisInput): PeriodAnalysis {
  const { range } = input;
  const current = metricsFrom(input.current, input.currentSavings);
  const previous = metricsFrom(input.previous, input.previousSavings);
  const categoryBreakdown = buildCategoryShares(input.categories);

  const insightsDetailed = buildOverviewInsights({
    label: range.label,
    prevLabel: range.prevLabel,
    current,
    previous,
    categories: categoryBreakdown,
    progress: range.progress,
    totalBalance: input.totalBalance,
    committedSoon: input.committedSoon,
  });

  return {
    period: {
      key: range.key,
      requested: range.requested,
      label: range.label,
      prevLabel: range.prevLabel,
      start: range.start,
      end: range.end,
      progress: range.progress,
    },
    current,
    previous,
    changes: {
      income: percentChange(current.income, previous.income),
      expenses: percentChange(current.expenses, previous.expenses),
    },
    categoryBreakdown,
    insights: insightsDetailed.map((insight) => insight.text),
    insightsDetailed,
  };
}
