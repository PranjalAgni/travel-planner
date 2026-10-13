import { DEFAULT_DURATION_MINUTES, type Category, type City, type PlanRequest } from "@travel/shared";
import { matrixPoints } from "../src/planner/schedule.js";
import type { TravelMatrix } from "../src/routing/types.js";

type SpotSpec = { name: string; x: number; y?: number; category?: Category; minutes?: number };

/** A city at position `x` (km along a straight road) with spots offset from it. */
export function city(id: string, x: number, spots: SpotSpec[]): City {
  return {
    id,
    place: { name: id, label: "", lat: 0, lon: x },
    spots: spots.map((s) => {
      const category = s.category ?? "other";
      return {
        id: `${id}:${s.name}`,
        place: { name: s.name, label: "", lat: s.y ?? 0, lon: s.x },
        category,
        durationMinutes: s.minutes ?? DEFAULT_DURATION_MINUTES[category],
      };
    }),
  };
}

export function request(overrides: Partial<PlanRequest> & Pick<PlanRequest, "cities">): PlanRequest {
  return {
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    dayStart: "09:00",
    dayEnd: "19:00",
    cityOrder: "optimize",
    pace: "relaxed",
    ...overrides,
  };
}

/**
 * Treats lat/lon as flat kilometre coordinates and drives at 1 km per minute,
 * so tests can reason about travel times directly.
 */
export function flatMatrix(req: PlanRequest): TravelMatrix {
  const pts = matrixPoints(req);
  const km = pts.map((a) => pts.map((b) => Math.hypot(a.lat - b.lat, a.lon - b.lon)));
  return { km, minutes: km.map((row) => row.map((d) => Math.round(d))), source: "estimate" };
}
