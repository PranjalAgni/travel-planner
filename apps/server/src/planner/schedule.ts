import {
  addDays,
  parseTime,
  tripDayCount,
  type City,
  type DayPlan,
  type PlanRequest,
  type PlanResponse,
  type Spot,
  type TimelineItem,
} from "@travel/shared";
import type { TravelMatrix } from "../routing/types.js";
import { shortestPath } from "./route.js";

/** Extra minutes added to every move between two places (parking, walking, waiting). */
export const TRANSFER_BUFFER_MINUTES = 10;

/** Weight of minutes spent past the day end, relative to normal minutes. */
const OVERRUN_PENALTY = 10_000;

/**
 * Node layout of the travel matrix the planner expects:
 * indices [0, cities) are city centres, followed by every spot in request order.
 */
export function matrixPoints(req: PlanRequest): { lat: number; lon: number }[] {
  return [...req.cities.map((c) => c.place), ...req.cities.flatMap((c) => c.spots.map((s) => s.place))];
}

type Step =
  | { kind: "visit"; spot: Spot; city: City; node: number; minutes: number; leadMinutes: number; leadKm: number }
  | { kind: "travel"; from: Spot; fromCity: City; to: Spot; toCity: City; minutes: number; km: number };

export function buildPlan(req: PlanRequest, matrix: TravelMatrix): Omit<PlanResponse, "routing"> {
  const legMinutes = (a: number, b: number) =>
    a === b || matrix.minutes[a]![b]! === 0 ? 0 : matrix.minutes[a]![b]! + TRANSFER_BUFFER_MINUTES;
  const legKm = (a: number, b: number) => matrix.km[a]![b]!;

  const spotNode = new Map<string, number>();
  let next = req.cities.length;
  for (const city of req.cities) for (const spot of city.spots) spotNode.set(spot.id, next++);

  const cityOrder = orderCities(req, legMinutes);
  const steps = buildSteps(cityOrder, spotNode, legMinutes, legKm);

  const dayLength = parseTime(req.dayEnd) - parseTime(req.dayStart);
  const daysAvailable = tripDayCount(req.startDate, req.endDate);
  const load = loadFn(steps);
  const daysNeeded = minimumDays(steps.length, load, dayLength);
  const dayCount = req.pace === "packed" || daysNeeded > daysAvailable ? daysNeeded : daysAvailable;
  const groups = partition(steps, load, dayCount, dayLength);

  const days = groups.map((group, i) => renderDay(group, addDays(req.startDate, i), i >= daysAvailable, req));
  labelFreeDays(days, cityOrder[0]!.id);
  const warnings = collectWarnings(steps, days, dayLength, daysNeeded, daysAvailable);

  let visitMinutes = 0;
  let travelMinutes = 0;
  let travelKm = 0;
  for (const item of days.flatMap((d) => d.items)) {
    if (item.kind === "visit") visitMinutes += item.end - item.start;
    else {
      travelMinutes += item.end - item.start;
      travelKm += item.distanceKm;
    }
  }

  return {
    days,
    cityOrder: cityOrder.map((c) => c.id),
    summary: {
      daysAvailable,
      daysNeeded,
      fits: daysNeeded <= daysAvailable,
      visitMinutes,
      travelMinutes,
      travelKm: Math.round(travelKm * 10) / 10,
    },
    warnings,
  };
}

function orderCities(req: PlanRequest, legMinutes: (a: number, b: number) => number): City[] {
  if (req.cityOrder === "keep" || req.cities.length <= 2) return req.cities;
  // The first city is where the trip starts; reorder the rest around it.
  const rest = req.cities.slice(1).map((_, i) => i + 1);
  return [req.cities[0]!, ...shortestPath(rest, legMinutes, 0).map((i) => req.cities[i]!)];
}

/** Flattens the trip into one ordered sequence of visits and intercity transfers. */
function buildSteps(
  cities: City[],
  spotNode: Map<string, number>,
  legMinutes: (a: number, b: number) => number,
  legKm: (a: number, b: number) => number,
): Step[] {
  const steps: Step[] = [];
  let previous: { spot: Spot; city: City; node: number } | undefined;

  for (const city of cities) {
    const nodes = city.spots.map((s) => spotNode.get(s.id)!);
    const bySpot = new Map(city.spots.map((s) => [spotNode.get(s.id)!, s]));
    const order = shortestPath(nodes, legMinutes, previous?.node);

    order.forEach((node, i) => {
      const spot = bySpot.get(node)!;
      if (i === 0 && previous) {
        steps.push({
          kind: "travel",
          from: previous.spot,
          fromCity: previous.city,
          to: spot,
          toCity: city,
          minutes: legMinutes(previous.node, node),
          km: legKm(previous.node, node),
        });
      }
      const lead = i > 0 ? order[i - 1]! : undefined;
      steps.push({
        kind: "visit",
        spot,
        city,
        node,
        minutes: spot.durationMinutes,
        leadMinutes: lead === undefined ? 0 : legMinutes(lead, node),
        leadKm: lead === undefined ? 0 : legKm(lead, node),
      });
      previous = { spot, city, node };
    });
  }
  return steps;
}

/**
 * Minutes a run of consecutive steps [from, to) takes when done on one day.
 * The transfer into the first step is dropped because the day starts there.
 */
type LoadFn = (from: number, to: number) => number;

function loadFn(steps: Step[]): LoadFn {
  const minutes = [0];
  const leads = [0];
  for (const step of steps) {
    minutes.push(minutes.at(-1)! + step.minutes);
    leads.push(leads.at(-1)! + (step.kind === "visit" ? step.leadMinutes : 0));
  }
  return (from, to) => (from >= to ? 0 : minutes[to]! - minutes[from]! + leads[to]! - leads[from + 1]!);
}

/** Fewest days that fit every step without overrunning (greedy is optimal for contiguous packing). */
function minimumDays(count: number, load: LoadFn, dayLength: number): number {
  let days = 1;
  let dayStart = 0;
  for (let i = 1; i < count; i++) {
    if (load(dayStart, i + 1) > dayLength) {
      days++;
      dayStart = i;
    }
  }
  return days;
}

/**
 * Splits steps into exactly `dayCount` consecutive (possibly empty) days,
 * minimising the sum of squared day loads so days come out balanced, with a
 * heavy penalty for running past the day end.
 */
function partition(steps: Step[], load: LoadFn, dayCount: number, dayLength: number): Step[][] {
  const n = steps.length;
  const cost = (from: number, to: number) => {
    const l = load(from, to);
    const over = Math.max(0, l - dayLength);
    return l * l + OVERRUN_PENALTY * over * over;
  };

  // best[d][i]: min cost of placing the first i steps into d days.
  const best = Array.from({ length: dayCount + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: dayCount + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0]![0] = 0;
  for (let d = 1; d <= dayCount; d++) {
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= i; j++) {
        const candidate = best[d - 1]![j]! + cost(j, i);
        if (candidate < best[d]![i]!) {
          best[d]![i] = candidate;
          cut[d]![i] = j;
        }
      }
    }
  }

  const groups: Step[][] = [];
  let end = n;
  for (let d = dayCount; d >= 1; d--) {
    const start = cut[d]![end]!;
    groups.push(steps.slice(start, end));
    end = start;
  }
  return groups.reverse();
}

function renderDay(group: Step[], date: string, overBudget: boolean, req: PlanRequest): DayPlan {
  const dayEnd = parseTime(req.dayEnd);
  let clock = parseTime(req.dayStart);
  const items: TimelineItem[] = [];
  const cityIds: string[] = [];
  const touch = (cityId: string) => {
    if (cityIds.at(-1) !== cityId) cityIds.push(cityId);
  };

  group.forEach((step, i) => {
    if (step.kind === "travel") {
      items.push({
        kind: "travel",
        fromName: step.from.place.name,
        toName: step.to.place.name,
        intercity: true,
        start: clock,
        end: clock + step.minutes,
        distanceKm: round1(step.km),
      });
      clock += step.minutes;
      touch(step.fromCity.id);
      touch(step.toCity.id);
      return;
    }
    const previous = i > 0 ? group[i - 1] : undefined;
    if (previous?.kind === "visit" && step.leadMinutes > 0) {
      items.push({
        kind: "travel",
        fromName: previous.spot.place.name,
        toName: step.spot.place.name,
        intercity: false,
        start: clock,
        end: clock + step.leadMinutes,
        distanceKm: round1(step.leadKm),
      });
      clock += step.leadMinutes;
    }
    touch(step.city.id);
    items.push({
      kind: "visit",
      spotId: step.spot.id,
      cityId: step.city.id,
      name: step.spot.place.name,
      category: step.spot.category,
      start: clock,
      end: clock + step.minutes,
    });
    clock += step.minutes;
  });

  return { date, cityIds, items, overBudget, overrun: clock > dayEnd };
}

/** Free days have no steps; attribute them to the city the traveller is staying in. */
function labelFreeDays(days: DayPlan[], firstCityId: string): void {
  let current = firstCityId;
  for (const day of days) {
    if (day.cityIds.length === 0) day.cityIds.push(current);
    current = day.cityIds.at(-1)!;
  }
}

function collectWarnings(
  steps: Step[],
  days: DayPlan[],
  dayLength: number,
  daysNeeded: number,
  daysAvailable: number,
): string[] {
  const warnings: string[] = [];
  if (daysNeeded > daysAvailable) {
    const extra = daysNeeded - daysAvailable;
    warnings.push(
      `These spots need ${daysNeeded} days but the trip has ${daysAvailable}. ` +
        `${extra} extra day${extra > 1 ? "s are" : " is"} shown at the end - remove spots, shorten visits, or extend the trip or daily hours.`,
    );
  }
  for (const step of steps) {
    if (step.minutes > dayLength) {
      warnings.push(
        step.kind === "visit"
          ? `${step.spot.place.name} takes longer than your daily hours, so that day runs late.`
          : `Getting from ${step.from.place.name} to ${step.toCity.place.name} takes longer than your daily hours.`,
      );
    }
  }
  const overruns = days.filter((d) => d.overrun && !d.overBudget).length;
  if (overruns > 0 && daysNeeded <= daysAvailable) {
    warnings.push(`${overruns} day${overruns > 1 ? "s run" : " runs"} past your daily end time.`);
  }
  return warnings;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
