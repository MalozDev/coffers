/** Distinct chart colours — used when a category has no colour of its own. */
export const CHART_COLORS = [
  "#3066be",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#eab308",
];

/** A category's own colour, or a stable palette colour by position. */
export function colorFor(index: number, provided?: string): string {
  if (provided && provided.trim()) return provided;
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Percentage label — small shares keep a decimal so they never read as 0%. */
export function percentLabel(percentage: number): string {
  const value = Number(percentage) || 0;
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}
