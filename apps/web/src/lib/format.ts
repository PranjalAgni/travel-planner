import { formatDuration } from "@travel/shared";

export { formatDuration, formatTime } from "@travel/shared";

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

const rangeFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "1 - 4 Nov 2026" style range, collapsing shared month and year. */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "No dates";
  return rangeFormat.formatRange(start, end);
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Infinity],
];

/** "5 minutes ago", "yesterday", ... */
export function formatRelative(timestamp: number, now = Date.now()): string {
  let value = (timestamp - now) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return unit === "second" ? "just now" : relativeFormat.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

export function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600].map((m) => ({
  value: m,
  label: formatDuration(m),
}));

/** Distinct colours for days on the map and in the itinerary. */
const DAY_COLORS = ["#4f46e5", "#e11d48", "#059669", "#d97706", "#0891b2", "#7c3aed", "#db2777", "#65a30d", "#ea580c", "#2563eb"];

export function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length]!;
}
