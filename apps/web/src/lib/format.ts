import { formatDuration } from "@travel/shared";

export { formatDuration, formatTime } from "@travel/shared";

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
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
