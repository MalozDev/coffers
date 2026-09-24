/*
 * Finance Engine — deterministic formatting helpers.
 * Locale is pinned so engine output (and tests) never depend on the host ICU.
 */

export const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** K1,234 — always absolute value; callers add their own sign. */
export function formatK(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return `K${rounded.toLocaleString("en-US")}`;
}

/** "+12%" / "−5%" — sign always present. */
export function formatSignedPct(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `−${Math.abs(rounded)}%`;
  return "0%";
}

/** "22 Sep" */
export function formatDayMonth(value: Date): string {
  return `${value.getDate()} ${SHORT_MONTHS[value.getMonth()]}`;
}

/** "22 Sep 2026" */
export function formatDayMonthYear(value: Date): string {
  return `${formatDayMonth(value)} ${value.getFullYear()}`;
}

/** "September 2026" */
export function monthLabel(value: Date): string {
  return `${LONG_MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

export function round(value: number, places = 0): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

/** Clamp into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
