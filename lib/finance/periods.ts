/*
 * Finance Engine — period resolution (pure).
 *
 * Turns the analysis page's presets (today | yesterday | week | month,
 * plus legacy daily/weekly/monthly) into concrete inclusive windows and a
 * calendar-aware comparison window. Calendar-aware means "previous month"
 * is the real previous calendar month, not "the 30 days before this one".
 */

import type { PeriodKey, PeriodRange } from "./types";
import { clamp, formatDayMonth, formatDayMonthYear, monthLabel } from "./format";

const ALIASES: Record<string, PeriodKey> = {
  today: "today",
  daily: "today",
  yesterday: "yesterday",
  week: "week",
  weekly: "week",
  month: "month",
  monthly: "month",
};

export function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Accepts Date instances and "YYYY-MM-DD" (or any parseable) strings. */
function toDateOnly(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : startOfDay(value);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function shiftDays(value: Date, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

/** Sunday-start week — matches the app's existing week definition. */
function weekStart(reference: Date): Date {
  const d = startOfDay(reference);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function weekEnd(start: Date): Date {
  return endOfDay(shiftDays(start, 6));
}

function monthStart(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

function monthEnd(reference: Date): Date {
  return endOfDay(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));
}

/** Elapsed fraction of [start, end] at `now`, clamped to a sensible floor. */
function elapsedFraction(start: Date, end: Date, now: Date): number {
  const total = end.getTime() + 1 - start.getTime();
  if (total <= 0) return 1;
  return clamp((now.getTime() - start.getTime()) / total, 0.02, 1);
}

function dayRange(
  requested: string,
  key: PeriodKey,
  label: string,
  prevLabel: string,
  day: Date
): PeriodRange {
  const start = startOfDay(day);
  const end = endOfDay(day);
  return {
    key,
    requested,
    label,
    prevLabel,
    start,
    end,
    prevStart: shiftDays(start, -1),
    prevEnd: shiftDays(end, -1),
    // Day windows are always complete enough for a fair comparison.
    progress: 1,
  };
}

/**
 * Resolve an analysis period into concrete windows.
 *
 * @param requested    "today" | "yesterday" | "week" | "month" (+ legacy
 *                     "daily" | "weekly" | "monthly")
 * @param referenceDate Optional "YYYY-MM-DD"/Date anchor — only honoured for
 *                     week/month and legacy daily (a specific past day).
 * @param now          Injectable clock (tests).
 */
export function resolvePeriod(
  requested?: string | null,
  referenceDate?: Date | string | null,
  now: Date = new Date()
): PeriodRange {
  const raw = (requested || "month").trim().toLowerCase();
  const hasExplicitDate = referenceDate !== null && referenceDate !== undefined && referenceDate !== "";

  let key: PeriodKey = ALIASES[raw] || "month";
  // Legacy `daily` + an explicit date meant "analyse that day", not today.
  if (raw === "daily" && hasExplicitDate) key = "day";

  if (key === "today") {
    return dayRange(raw, "today", "Today", "Yesterday", startOfDay(now));
  }

  if (key === "yesterday") {
    const yesterday = shiftDays(startOfDay(now), -1);
    return dayRange(raw, "yesterday", "Yesterday", formatDayMonth(shiftDays(yesterday, -1)), yesterday);
  }

  if (key === "day") {
    const day = toDateOnly(referenceDate) || startOfDay(now);
    const label =
      day.getFullYear() === now.getFullYear()
        ? formatDayMonth(day)
        : formatDayMonthYear(day);
    const prev = shiftDays(day, -1);
    const prevLabel =
      prev.getFullYear() === now.getFullYear()
        ? formatDayMonth(prev)
        : formatDayMonthYear(prev);
    return dayRange(raw, "day", label, prevLabel, day);
  }

  if (key === "week") {
    const reference = toDateOnly(referenceDate) || startOfDay(now);
    const start = weekStart(reference);
    const end = weekEnd(start);
    const prevStart = shiftDays(start, -7);
    const prevEnd = shiftDays(end, -7);
    const isCurrent = now >= start && now <= end;
    return {
      key: "week",
      requested: raw,
      label: isCurrent ? "This week" : `Week of ${formatDayMonth(start)}`,
      prevLabel: isCurrent ? "Last week" : `Week of ${formatDayMonth(prevStart)}`,
      start,
      end,
      prevStart,
      prevEnd,
      progress: isCurrent ? elapsedFraction(start, end, now) : 1,
    };
  }

  // month (default)
  const reference = toDateOnly(referenceDate) || startOfDay(now);
  const start = monthStart(reference);
  const end = monthEnd(reference);
  const prevMonthRef = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const prevStart = monthStart(prevMonthRef);
  const prevEnd = monthEnd(prevMonthRef);
  const isCurrent = now >= start && now <= end;
  return {
    key: "month",
    requested: raw,
    label: monthLabel(reference),
    prevLabel: monthLabel(prevMonthRef),
    start,
    end,
    prevStart,
    prevEnd,
    progress: isCurrent ? elapsedFraction(start, end, now) : 1,
  };
}
