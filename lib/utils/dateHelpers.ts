/**
 * Format a date for display
 */
export function formatDate(
  date: Date | string,
  format: "short" | "long" | "relative" = "short"
): string {
  const d = new Date(date);

  switch (format) {
    case "short":
      return d.toLocaleDateString("en-ZM", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

    case "long":
      return d.toLocaleDateString("en-ZM", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    case "relative":
      return getRelativeTime(d);

    default:
      return d.toLocaleDateString("en-ZM");
  }
}

/**
 * Format time for display
 */
export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString("en-ZM", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (Math.abs(diffDays) >= 7) {
    return formatDate(date, "short");
  }

  if (Math.abs(diffDays) > 0) {
    return diffDays > 0
      ? `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
      : `in ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? "s" : ""}`;
  }

  if (Math.abs(diffHours) > 0) {
    return diffHours > 0
      ? `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
      : `in ${Math.abs(diffHours)} hour${Math.abs(diffHours) > 1 ? "s" : ""}`;
  }

  if (Math.abs(diffMinutes) > 0) {
    return diffMinutes > 0
      ? `${diffMinutes} min${diffMinutes > 1 ? "s" : ""} ago`
      : `in ${Math.abs(diffMinutes)} min${Math.abs(diffMinutes) > 1 ? "s" : ""}`;
  }

  return "Just now";
}

/**
 * Get greeting based on time of day
 */
export function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning 👋";
  if (hour < 17) return "Good afternoon 👋";
  if (hour < 21) return "Good evening 👋";
  return "Good night 👋";
}

/**
 * Get start and end of a period
 */
export function getPeriodDates(
  period: "day" | "week" | "month" | "year",
  date: Date = new Date()
): { start: Date; end: Date } {
  const d = new Date(date);
  const start = new Date(d);
  const end = new Date(d);

  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;

    case "week":
      start.setDate(d.getDate() - d.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;

    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(d.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;

    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Get days until a date
 */
export function daysUntil(date: Date | string): number {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
