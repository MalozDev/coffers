"use client";

import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterGroupProps {
  /** e.g. "STATUS", "CATEGORY", "DATE" */
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Renders a divider above this group so categories never blur together */
  divide?: boolean;
  className?: string;
}

/**
 * A labelled row of filter chips.
 *
 * Multiple groups stacked together are separated by a rule so unrelated
 * filters (STATUS vs DATE vs CATEGORY) never look like one confusing group:
 *
 *   STATUS
 *   [ All ] [ Saved ] [ Received ]
 *   ───────────────────────────────
 *   DATE
 *   [ All ] [ Today ] [ Yesterday ] [ Custom ]
 */
export function FilterGroup({
  label,
  options,
  value,
  onChange,
  divide = false,
  className,
}: FilterGroupProps) {
  return (
    <div className={cn(divide && "border-t border-border pt-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5 no-select">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default FilterGroup;
