import { z } from "zod";
import {
  CityOrderSchema,
  PaceSchema,
  PlaceSchema,
  PlanResponseSchema,
  SpotSchema,
  addDays,
  type PlanRequest,
} from "@travel/shared";

/** A city being edited; unlike a planned city it may not have a place or spots yet. */
export const DraftCitySchema = z.object({
  id: z.string().min(1),
  place: PlaceSchema.nullable(),
  spots: z.array(SpotSchema),
});
export type DraftCity = z.infer<typeof DraftCitySchema>;

/** The trip as the user is editing it. Fields may be incomplete or invalid until planning. */
export const TripDraftSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  dayStart: z.string(),
  dayEnd: z.string(),
  pace: PaceSchema,
  cityOrder: CityOrderSchema,
  cities: z.array(DraftCitySchema).min(1),
});
export type TripDraft = z.infer<typeof TripDraftSchema>;

/** A plan together with the exact request that produced it, so we can tell when it is stale. */
export const SavedPlanSchema = z.object({ requestKey: z.string(), response: PlanResponseSchema });
export type SavedPlan = z.infer<typeof SavedPlanSchema>;

export function newId(): string {
  return crypto.randomUUID();
}

export function newCity(): DraftCity {
  return { id: newId(), place: null, spots: [] };
}

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function defaultDraft(): TripDraft {
  const start = addDays(localToday(), 30);
  return {
    startDate: start,
    endDate: addDays(start, 3),
    dayStart: "09:00",
    dayEnd: "20:00",
    pace: "relaxed",
    cityOrder: "optimize",
    cities: [newCity()],
  };
}

/** Problems that stop the draft from being planned, phrased for the user. */
export function draftProblems(draft: TripDraft): string[] {
  const problems: string[] = [];
  if (!draft.startDate || !draft.endDate) problems.push("Pick your travel dates.");
  else if (draft.endDate < draft.startDate) problems.push("The end date is before the start date.");
  if (draft.dayEnd <= draft.dayStart) problems.push("Your day has to end after it starts.");
  draft.cities.forEach((city, i) => {
    const name = city.place?.name ?? `City ${i + 1}`;
    if (!city.place) problems.push(`Choose a place for ${name}.`);
    else if (city.spots.length === 0) problems.push(`Add at least one spot in ${name}.`);
  });
  return problems;
}

export function toPlanRequest(draft: TripDraft): PlanRequest {
  return {
    startDate: draft.startDate,
    endDate: draft.endDate,
    dayStart: draft.dayStart,
    dayEnd: draft.dayEnd,
    pace: draft.pace,
    cityOrder: draft.cityOrder,
    cities: draft.cities.map((c) => ({ id: c.id, place: c.place!, spots: c.spots })),
  };
}

/** True when the draft holds nothing worth keeping. */
export function isBlankDraft(draft: TripDraft): boolean {
  return draft.cities.every((c) => !c.place && c.spots.length === 0);
}

const monthFormat = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

/** A readable default name such as "Lisbon & Porto, Nov 2026". */
export function suggestTripName(draft: TripDraft): string {
  const names = draft.cities.flatMap((c) => (c.place ? [c.place.name] : []));
  if (names.length === 0) return "Untitled trip";
  const where =
    names.length <= 2
        ? names.join(" & ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  const when = /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)
    ? `, ${monthFormat.format(new Date(`${draft.startDate}T12:00:00`))}`
    : "";
  return where + when;
}

/** Appends " (2)", " (3)", ... so a name does not clash with existing ones. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  let n = 2;
  while (names.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}
