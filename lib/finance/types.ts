/*
 * Finance Engine — core contracts (docs/ask-engine.md §5)
 *
 * Pure data contracts only: no MongoDB, no framework, no side effects.
 * Every module under lib/finance/ that does NOT touch the database is safe
 * to unit-test directly (see tests/).
 */

/** Snapshot timestamp stamped once per reasoning turn (§3.3). */
export interface AsOf {
  asOf: Date;
}

export type MetaSource = "live" | "materialized" | "snapshot";

/** Freshness disclosure on every engine result (§3.7). */
export interface Meta {
  asOf: string;
  source: MetaSource;
  stale: boolean;
}

/** Every engine result travels with its freshness contract. */
export interface MetaEnvelope<T> {
  data: T;
  meta: Meta;
}

/** Period presets used by the analysis page. "day" = an arbitrary past day (legacy). */
export type PeriodKey = "today" | "yesterday" | "day" | "week" | "month";

/** A resolved, inclusive period window plus its calendar-aware comparison window. */
export interface PeriodRange {
  /** Resolved kind of this window. */
  key: PeriodKey;
  /** What the caller asked for (e.g. "daily", "week"). */
  requested: string;
  /** Human label, e.g. "Today", "This week", "September 2026". */
  label: string;
  /** Human label of the comparison window, e.g. "Yesterday", "August 2026". */
  prevLabel: string;
  /** Inclusive window: 00:00:00.000 → 23:59:59.999 local time. */
  start: Date;
  end: Date;
  /** Calendar-aware previous window (previous day / week / month). */
  prevStart: Date;
  prevEnd: Date;
  /**
   * Fraction of the window that has elapsed (0..1). Closed historical
   * windows are 1; day-sized windows are always 1 — pace comparisons for
   * short windows are noise, so the insights builder skips them.
   */
  progress: number;
}

/** Raw flow totals for a window, straight from the aggregation. */
export interface FlowTotals {
  income: number;
  expenses: number;
  count: number;
  incomeCount: number;
  expenseCount: number;
}

export type InsightTone = "positive" | "negative" | "warning" | "neutral";

export interface PeriodInsight {
  id: string;
  tone: InsightTone;
  text: string;
}

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  color?: string;
  icon?: string;
  total: number;
  count: number;
  /** Share of *categorized* spending in the window, 0..100. */
  percentage: number;
}

/** Derived metrics for one window — the numbers insights reason about. */
export interface PeriodMetrics extends FlowTotals {
  /** Net movement INTO savings accounts during the window. */
  savings: number;
  /** savings / income * 100 (0 when no income). */
  savingsRate: number;
  /** income - expenses. */
  net: number;
  /** expenses / expenseCount (0 with no expenses). */
  avgTransaction: number;
}

export interface PeriodAnalysis {
  period: {
    key: PeriodKey;
    requested: string;
    label: string;
    prevLabel: string;
    start: Date;
    end: Date;
    progress: number;
  };
  current: PeriodMetrics;
  previous: PeriodMetrics;
  changes: {
    income: number;
    expenses: number;
  };
  categoryBreakdown: CategoryShare[];
  /** Plain-text insights (kept stable for existing consumers). */
  insights: string[];
  /** The same insights with tone metadata for the UI. */
  insightsDetailed: PeriodInsight[];
}
