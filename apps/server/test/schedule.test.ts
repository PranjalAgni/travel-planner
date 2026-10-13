import { describe, expect, it } from "vitest";
import { parseTime, type DayPlan, type VisitItem } from "@travel/shared";
import { buildPlan, TRANSFER_BUFFER_MINUTES } from "../src/planner/schedule.js";
import { city, flatMatrix, request } from "./fixtures.js";

const visits = (day: DayPlan) => day.items.filter((i): i is VisitItem => i.kind === "visit").map((i) => i.name);

function plan(req: Parameters<typeof buildPlan>[0]) {
  return buildPlan(req, flatMatrix(req));
}

describe("buildPlan", () => {
  it("visits every spot exactly once", () => {
    const req = request({
      cities: [
        city("A", 0, [
          { name: "a1", x: 1 },
          { name: "a2", x: 2 },
          { name: "a3", x: 3 },
        ]),
        city("B", 300, [
          { name: "b1", x: 301 },
          { name: "b2", x: 302 },
        ]),
      ],
    });
    const result = plan(req);
    const all = result.days.flatMap(visits).sort();
    expect(all).toEqual(["a1", "a2", "a3", "b1", "b2"]);
    expect(result.days).toHaveLength(3);
    expect(result.summary.fits).toBe(true);
  });

  it("orders spots within a city to avoid backtracking", () => {
    const req = request({
      endDate: "2026-11-01",
      cities: [
        city("A", 0, [
          { name: "far", x: 30, minutes: 30 },
          { name: "near", x: 1, minutes: 30 },
          { name: "mid", x: 15, minutes: 30 },
        ]),
      ],
    });
    const names = visits(plan(req).days[0]!);
    expect([names, [...names].reverse()]).toContainEqual(["near", "mid", "far"]);
  });

  it("keeps the first city and reorders the rest to minimise driving", () => {
    const req = request({
      cities: [
        city("Start", 0, [{ name: "s", x: 0 }]),
        city("Far", 500, [{ name: "f", x: 500 }]),
        city("Near", 100, [{ name: "n", x: 100 }]),
      ],
    });
    expect(plan(req).cityOrder).toEqual(["Start", "Near", "Far"]);
    expect(plan({ ...req, cityOrder: "keep" }).cityOrder).toEqual(["Start", "Far", "Near"]);
  });

  it("schedules timeline items back to back from the day start", () => {
    const req = request({
      endDate: "2026-11-01",
      cities: [
        city("A", 0, [
          { name: "first", x: 0, minutes: 60 },
          { name: "second", x: 20, minutes: 45 },
        ]),
      ],
    });
    const [day] = plan(req).days;
    const items = day!.items;
    expect(items.map((i) => i.kind)).toEqual(["visit", "travel", "visit"]);
    expect(items[0]!.start).toBe(parseTime("09:00"));
    for (let i = 1; i < items.length; i++) expect(items[i]!.start).toBe(items[i - 1]!.end);
    expect(items[1]!.end - items[1]!.start).toBe(20 + TRANSFER_BUFFER_MINUTES);
  });

  it("balances spots across days in relaxed pace", () => {
    const spots = Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, x: i, minutes: 120 }));
    const result = plan(request({ cities: [city("A", 0, spots)] }));
    expect(result.days.map((d) => visits(d).length)).toEqual([2, 2, 2]);
  });

  it("uses as few days as possible in packed pace", () => {
    const spots = Array.from({ length: 4 }, (_, i) => ({ name: `s${i}`, x: i, minutes: 60 }));
    const result = plan(request({ pace: "packed", cities: [city("A", 0, spots)] }));
    expect(result.days).toHaveLength(1);
    expect(result.summary).toMatchObject({ daysAvailable: 3, daysNeeded: 1, fits: true });
  });

  it("adds over-budget days and a warning when the trip is too short", () => {
    const spots = Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, x: i, minutes: 480 }));
    const result = plan(request({ endDate: "2026-11-02", cities: [city("A", 0, spots)] }));
    expect(result.summary).toMatchObject({ daysAvailable: 2, daysNeeded: 5, fits: false });
    expect(result.days.map((d) => d.overBudget)).toEqual([false, false, true, true, true]);
    expect(result.days.map((d) => d.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    expect(result.warnings[0]).toMatch(/need 5 days but the trip has 2/);
  });

  it("includes the intercity drive in the day it happens", () => {
    const req = request({
      endDate: "2026-11-01",
      dayEnd: "21:00",
      cities: [city("A", 0, [{ name: "a", x: 0, minutes: 60 }]), city("B", 120, [{ name: "b", x: 120, minutes: 60 }])],
    });
    const [day] = plan(req).days;
    const travel = day!.items.find((i) => i.kind === "travel");
    expect(travel).toMatchObject({ intercity: true, fromName: "a", toName: "b", distanceKm: 120 });
    expect(day!.cityIds).toEqual(["A", "B"]);
  });

  it("lists both cities on a travel day that starts with the drive", () => {
    const req = request({
      endDate: "2026-11-02",
      cities: [city("A", 0, [{ name: "a", x: 0, minutes: 480 }]), city("B", 200, [{ name: "b", x: 200, minutes: 60 }])],
    });
    const days = plan(req).days;
    expect(days[1]!.items[0]).toMatchObject({ kind: "travel", intercity: true });
    expect(days[1]!.cityIds).toEqual(["A", "B"]);
  });

  it("labels free days with the city the traveller is in", () => {
    const result = plan(
      request({ endDate: "2026-11-04", cities: [city("A", 0, [{ name: "a", x: 0 }]), city("B", 50, [{ name: "b", x: 50 }])] }),
    );
    expect(result.days).toHaveLength(4);
    for (const day of result.days) expect(day.cityIds.length).toBeGreaterThan(0);
  });

  it("flags a spot that cannot fit in a single day", () => {
    const result = plan(
      request({ endDate: "2026-11-01", cities: [city("A", 0, [{ name: "Marathon hike", x: 0, minutes: 720 }])] }),
    );
    expect(result.days[0]!.overrun).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/Marathon hike takes longer than your daily hours/);
  });
});
