"use client";

import { Input } from "@/components/ui/input";
import { FilterGroup } from "@/components/ui/filter-group";

export type DateFilterValue = "all" | "today" | "yesterday" | "custom";

export const DATE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "custom", label: "Custom" },
];

/** Local-time calendar key, e.g. "2026-09-23" */
export function dateKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export interface DateBounds {
  from: string;
  to: string;
}

/** Resolve a date filter into an inclusive [from, to] pair of day keys. */
export function boundsFor(
  filter: DateFilterValue,
  from = "",
  to = ""
): DateBounds {
  switch (filter) {
    case "today":
      return { from: shiftDays(0), to: shiftDays(0) };
    case "yesterday":
      return { from: shiftDays(-1), to: shiftDays(-1) };
    case "custom":
      return { from, to };
    default:
      return { from: "", to: "" };
  }
}

/** Does a record dated `value` fall inside these bounds? */
export function isWithinBounds(value: string, bounds: DateBounds): boolean {
  const key = dateKey(value);
  return (!bounds.from || key >= bounds.from) && (!bounds.to || key <= bounds.to);
}

/**
 * Human-friendly day label: "Today", "Yesterday", "Sep 20" (this year)
 * or "Sep 20, 2025" (any earlier year) instead of a bare numeric date.
 */
export function humanDayLabel(value: string | Date): string {
  const key = dateKey(value);
  if (key === shiftDays(0)) return "Today";
  if (key === shiftDays(-1)) return "Yesterday";
  const d = typeof value === "string" ? new Date(value) : value;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-ZM", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

interface DateFilterGroupProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  /** Only used when value === "custom" */
  from?: string;
  to?: string;
  onFromChange?: (value: string) => void;
  onToChange?: (value: string) => void;
  /** Divider above the group so it reads as its own category */
  divide?: boolean;
  /** Extra option appended after Custom, e.g. a 7-day shortcut */
  label?: string;
}

/** The shared DATE filter block: All / Today / Yesterday / Custom. */
export function DateFilterGroup({
  value,
  onChange,
  from = "",
  to = "",
  onFromChange,
  onToChange,
  divide = true,
  label = "DATE",
}: DateFilterGroupProps) {
  return (
    <>
      <FilterGroup
        label={label}
        options={DATE_FILTER_OPTIONS}
        value={value}
        onChange={(next) => onChange(next as DateFilterValue)}
        divide={divide}
      />
      {value === "custom" && onFromChange && onToChange && (
        // Stacked top → bottom, each field labelled so it is obvious
        // which end of the range you are picking.
        <div className="mt-2 space-y-2">
          <div>
            <label
              htmlFor="date-filter-from"
              className="mb-1 block text-[11px] font-medium text-muted-foreground"
            >
              From
            </label>
            <Input
              id="date-filter-from"
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="date-filter-to"
              className="mb-1 block text-[11px] font-medium text-muted-foreground"
            >
              To
            </label>
            <Input
              id="date-filter-to"
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Small wrapper that gives every filter card the same padding/spacing. */
export function FilterCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-3 space-y-3 ${className}`}
    >
      {children}
    </div>
  );
}
