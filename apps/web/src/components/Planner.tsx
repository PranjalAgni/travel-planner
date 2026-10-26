"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ApiRequestError, planTrip } from "@/lib/api";
import { draftProblems, newCity, toPlanRequest, type DraftCity, type TripDraft } from "@/lib/trip";
import { updateTrip, useTrip } from "@/lib/trip-store";
import { CityCard } from "./CityCard";
import { Itinerary } from "./Itinerary";
import { useSharedLinkReceiver } from "./SharedLinkReceiver";
import { TripBar } from "./TripBar";
import { TripSettings } from "./TripSettings";

// Leaflet touches `window` on import, so the map only renders in the browser.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-slate-100" />,
});

type PlanError = { message: string; details: string[] };

export function Planner() {
  const trip = useTrip();
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<PlanError | null>(null);
  const shareLink = useSharedLinkReceiver();
  // Remembered per plan object, so opening another trip or re-planning clears the selection.
  const [selection, setSelection] = useState<{ plan: unknown; day: number } | null>(null);

  const draft = trip?.draft;
  const requestKey = useMemo(() => (draft ? JSON.stringify(toPlanRequest(draft)) : ""), [draft]);
  const cityNames = useMemo(
    () => new Map((draft?.cities ?? []).map((c, i) => [c.id, c.place?.name ?? `City ${i + 1}`])),
    [draft?.cities],
  );

  if (!trip || !draft) return <LoadingShell />;

  const plan = trip.plan;
  const selectedDay = selection && selection.plan === plan ? selection.day : null;
  const setSelectedDay = (day: number | null) => setSelection(day === null ? null : { plan, day });
  const stale = plan !== null && plan.requestKey !== requestKey;
  const problems = draftProblems(draft);

  const setDraft = (patch: Partial<TripDraft>) => updateTrip((s) => ({ ...s, draft: { ...s.draft, ...patch } }));
  const setCities = (update: (cities: DraftCity[]) => DraftCity[]) =>
    updateTrip((s) => ({ ...s, draft: { ...s.draft, cities: update(s.draft.cities) } }));

  async function onPlan() {
    if (!draft || problems.length > 0) return;
    setPlanning(true);
    setError(null);
    try {
      const request = toPlanRequest(draft);
      const response = await planTrip(request);
      updateTrip((s) => ({ ...s, plan: { requestKey: JSON.stringify(request), response } }));
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? { message: err.message, details: err.details }
          : { message: "Planning failed. Please try again.", details: [] },
      );
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-slate-200 bg-slate-50 lg:w-[440px] lg:border-r">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-5">
          {shareLink.error && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <p className="flex-1">{shareLink.error}</p>
              <button type="button" onClick={shareLink.dismissError} className="shrink-0 text-xs font-medium text-rose-700 hover:text-rose-900">
                Dismiss
              </button>
            </div>
          )}
          <TripBar trip={trip} />
          <TripSettings draft={draft} onChange={setDraft} />

          <h2 className="pt-1 text-sm font-semibold text-slate-900">Cities &amp; spots</h2>

          {draft.cities.map((city, i) => (
            <CityCard
              key={city.id}
              city={city}
              index={i}
              total={draft.cities.length}
              showReorder={draft.cities.length > 1}
              onChange={(next) => setCities((cities) => cities.map((c) => (c.id === next.id ? next : c)))}
              onRemove={() => setCities((cities) => cities.filter((c) => c.id !== city.id))}
              onMove={(delta) =>
                setCities((cities) => {
                  const next = [...cities];
                  const [moved] = next.splice(i, 1);
                  next.splice(i + delta, 0, moved!);
                  return next;
                })
              }
            />
          ))}

          <button
            type="button"
            onClick={() => setCities((cities) => [...cities, newCity()])}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-white hover:text-slate-900"
          >
            <span aria-hidden className="text-base leading-none">
              +
            </span>
            Add another city
          </button>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4 lg:px-5">
          {problems.length > 0 && <p className="mb-2 text-xs text-slate-500">{problems[0]}</p>}
          <button
            type="button"
            onClick={onPlan}
            disabled={planning || problems.length > 0}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {planning && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {planning ? "Planning your trip..." : plan && !stale ? "Re-plan trip" : "Plan my trip"}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="h-[340px] shrink-0 border-b border-slate-200 lg:h-[42vh]">
          <TripMap cities={draft.cities} plan={stale ? null : (plan?.response ?? null)} selectedDay={selectedDay} />
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 lg:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {error && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                <p className="font-medium">{error.message}</p>
                {error.details.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {error.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {plan && stale && (
              <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                You changed the trip since this plan was made. Re-plan to update it.
              </p>
            )}
            {plan ? (
              <div className={stale ? "opacity-50" : undefined}>
                <Itinerary
                  plan={plan.response}
                  cityNames={cityNames}
                  selectedDay={stale ? null : selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </main>
      {shareLink.dialog}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-2xl" aria-hidden>
        🗺️
      </p>
      <h2 className="mt-2 text-base font-semibold text-slate-900">Your itinerary will appear here</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        Pick your dates, add the cities you are visiting and the spots you want to see in each. We will work out the
        quickest order and split it into days.
      </p>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-slate-400" aria-busy>
      Loading your trip...
    </div>
  );
}
