"use client";

import type { DayPlan, PlanResponse, TravelItem, VisitItem } from "@travel/shared";
import { dayColor, formatDate, formatDistance, formatDuration, formatTime } from "@/lib/format";
import { CategoryIcon } from "./CategoryIcon";

type Props = {
  plan: PlanResponse;
  cityNames: Map<string, string>;
  selectedDay: number | null;
  onSelectDay: (index: number | null) => void;
};

export function Itinerary({ plan, cityNames, selectedDay, onSelectDay }: Props) {
  const { summary } = plan;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Days"
          value={`${plan.days.length} / ${summary.daysAvailable}`}
          tone={summary.fits ? "good" : "bad"}
        />
        <Stat label="Sightseeing" value={formatDuration(summary.visitMinutes)} />
        <Stat label="Travelling" value={formatDuration(summary.travelMinutes)} />
        <Stat label="Distance" value={formatDistance(summary.travelKm)} />
      </dl>

      {plan.routing === "estimate" && (
        <Notice tone="info">Live road routing was unavailable, so travel times are estimates from straight-line distance.</Notice>
      )}
      {plan.warnings.map((w) => (
        <Notice key={w} tone={summary.fits ? "warn" : "bad"}>
          {w}
        </Notice>
      ))}

      <ol className="space-y-3">
        {plan.days.map((day, i) => (
          <li key={day.date}>
            <DayCard
              day={day}
              index={i}
              cityNames={cityNames}
              selected={selectedDay === i}
              onToggle={() => onSelectDay(selectedDay === i ? null : i)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function DayCard({
  day,
  index,
  cityNames,
  selected,
  onToggle,
}: {
  day: DayPlan;
  index: number;
  cityNames: Map<string, string>;
  selected: boolean;
  onToggle: () => void;
}) {
  const color = dayColor(index);
  const route = day.cityIds.map((id) => cityNames.get(id) ?? "Unknown").join(" → ");
  const visits = day.items.filter((i): i is VisitItem => i.kind === "visit");
  const travelling = day.items.some((i) => i.kind === "travel" && i.intercity);
  const summary =
    visits.length > 0
      ? `${visits.length} spot${visits.length > 1 ? "s" : ""}`
      : travelling
        ? "Travel day"
        : "Free day";

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        selected ? "border-transparent ring-2" : "border-slate-200"
      }`}
      style={selected ? ({ "--tw-ring-color": color } as React.CSSProperties) : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          <span className="sr-only">Day </span>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{route}</h3>
            {day.overBudget && <Badge tone="bad">Extra day</Badge>}
            {!day.overBudget && day.overrun && <Badge tone="warn">Runs late</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            {formatDate(day.date)} · {summary}
          </p>
        </div>
        <span className="hidden text-xs text-slate-400 sm:block">{selected ? "Showing on map" : "Show on map"}</span>
      </button>

      <div className="border-t border-slate-100 px-4 py-3">
        {day.items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing planned - a free day to explore {route} at your own pace.</p>
        ) : (
          <ol className="relative">
            {day.items.map((item, i) =>
              item.kind === "visit" ? (
                <VisitRow key={item.spotId} item={item} />
              ) : (
                <TravelRow key={`t${i}`} item={item} toCity={cityNames.get(day.cityIds.at(-1) ?? "")} />
              ),
            )}
          </ol>
        )}
      </div>
    </article>
  );
}

function VisitRow({ item }: { item: VisitItem }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <time className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
        {formatTime(item.start)} - {formatTime(item.end)}
      </time>
      <CategoryIcon category={item.category} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
      </div>
      <span className="shrink-0 text-xs text-slate-500">{formatDuration(item.end - item.start)}</span>
    </li>
  );
}

function TravelRow({ item, toCity }: { item: TravelItem; toCity?: string }) {
  const minutes = item.end - item.start;
  return (
    <li className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0" />
      <span className="flex w-7 shrink-0 justify-center">
        <span className="h-5 border-l-2 border-dotted border-slate-300" />
      </span>
      <span className={`text-xs ${item.intercity ? "font-medium text-indigo-700" : "text-slate-500"}`}>
        {item.intercity ? `Travel to ${toCity ?? item.toName}` : "Drive"} · {formatDuration(minutes)} ·{" "}
        {formatDistance(item.distanceKm)}
      </span>
    </li>
  );
}

const TONES = {
  good: "text-emerald-700",
  bad: "text-rose-700",
  warn: "text-amber-700",
  info: "text-slate-700",
} as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: keyof typeof TONES }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone ? TONES[tone] : "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "bad" | "info"; children: React.ReactNode }) {
  const styles = {
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];
  return <p className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</p>;
}

function Badge({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  const styles = tone === "bad" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>{children}</span>;
}
