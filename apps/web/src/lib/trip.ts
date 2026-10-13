import { addDays, type CityOrder, type Pace, type Place, type PlanRequest, type Spot } from "@travel/shared";

export type DraftCity = { id: string; place: Place | null; spots: Spot[] };

export type TripDraft = {
  startDate: string;
  endDate: string;
  dayStart: string;
  dayEnd: string;
  pace: Pace;
  cityOrder: CityOrder;
  cities: DraftCity[];
};

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
