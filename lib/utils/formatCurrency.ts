const CURRENCY_SYMBOL = "K";
const CURRENCY_LOCALE = "en-ZM";

/**
 * Format a number as ZMK currency
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "K4,820")
 */
export function formatCurrency(
  amount: number,
  options?: {
    showSign?: boolean;
    compact?: boolean;
    decimals?: number;
  }
): string {
  const { showSign = false, compact = false, decimals = 0 } = options ?? {};

  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency: "ZMW",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    notation: compact ? "compact" : "standard",
  }).format(amount);

  // Replace "ZK" with "K" for our preferred display
  return formatted.replace(/ZK|ZMW/g, CURRENCY_SYMBOL);
}

/**
 * Format amount with sign indicator
 * @param amount - The amount (positive or negative)
 * @returns Formatted string with + or − prefix
 */
export function formatAmountWithSign(amount: number): string {
  const prefix = amount >= 0 ? "+" : "−";
  return `${prefix} ${formatCurrency(Math.abs(amount))}`;
}

/**
 * Format a compact currency amount
 * @param amount - The amount to format
 * @returns Compact formatted string (e.g., "K4.8K")
 */
export function formatCompactCurrency(amount: number): string {
  return formatCurrency(amount, { compact: true, decimals: 1 });
}
