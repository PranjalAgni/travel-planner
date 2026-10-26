import { z } from "zod";

export const CATEGORIES = [
  "adventure",
  "attraction",
  "museum",
  "nature",
  "cafe",
  "restaurant",
  "nightlife",
  "shopping",
  "other",
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  adventure: "Adventure",
  attraction: "Attraction",
  museum: "Museum",
  nature: "Park / Nature",
  cafe: "Cafe",
  restaurant: "Restaurant",
  nightlife: "Bar / Nightlife",
  shopping: "Shopping",
  other: "Other",
};

/** Typical time people spend at a spot of each category, in minutes. */
export const DEFAULT_DURATION_MINUTES: Record<Category, number> = {
  adventure: 240,
  attraction: 90,
  museum: 150,
  nature: 90,
  cafe: 60,
  restaurant: 90,
  nightlife: 120,
  shopping: 120,
  other: 90,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_TRIP_DAYS = 60;
export const MAX_SPOTS = 150;

export const PlaceSchema = z.object({
  name: z.string().min(1),
  /** Human readable context, e.g. "Rue Saint-Benoit, Paris, France". */
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Raw OSM tag value (e.g. "cafe") when known; used to guess a category. */
  kind: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const SpotSchema = z.object({
  id: z.string().min(1),
  place: PlaceSchema,
  category: CategorySchema,
  durationMinutes: z.number().int().min(10).max(16 * 60),
});
export type Spot = z.infer<typeof SpotSchema>;

export const CitySchema = z.object({
  id: z.string().min(1),
  place: PlaceSchema,
  spots: z.array(SpotSchema).min(1, "Add at least one spot to every city"),
});
export type City = z.infer<typeof CitySchema>;

export const CityOrderSchema = z.enum(["optimize", "keep"]);
export const PaceSchema = z.enum(["relaxed", "packed"]);
export type CityOrder = z.infer<typeof CityOrderSchema>;
export type Pace = z.infer<typeof PaceSchema>;

export const PlanRequestSchema = z
  .object({
    startDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
    endDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
    dayStart: z.string().regex(TIME_RE, "Use HH:MM"),
    dayEnd: z.string().regex(TIME_RE, "Use HH:MM"),
    /** "optimize" keeps the first city as the starting point and reorders the rest. */
    cityOrder: CityOrderSchema,
    /** "relaxed" spreads spots over every available day, "packed" uses as few days as possible. */
    pace: PaceSchema,
    cities: z.array(CitySchema).min(1, "Add at least one city"),
  })
  .superRefine((req, ctx) => {
    const days = tripDayCount(req.startDate, req.endDate);
    if (Number.isNaN(days)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Invalid date" });
    } else if (days < 1) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    } else if (days > MAX_TRIP_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: `Trips can be at most ${MAX_TRIP_DAYS} days` });
    }
    if (parseTime(req.dayEnd) - parseTime(req.dayStart) < 60) {
      ctx.addIssue({ code: "custom", path: ["dayEnd"], message: "Day must end at least an hour after it starts" });
    }
    const spotCount = req.cities.reduce((n, c) => n + c.spots.length, 0);
    if (spotCount > MAX_SPOTS) {
      ctx.addIssue({ code: "custom", path: ["cities"], message: `At most ${MAX_SPOTS} spots per trip` });
    }
  });
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const VisitItemSchema = z.object({
  kind: z.literal("visit"),
  spotId: z.string(),
  cityId: z.string(),
  name: z.string(),
  category: CategorySchema,
  /** Minutes since midnight of the day. May exceed 24h when a day overruns. */
  start: z.number(),
  end: z.number(),
});
export type VisitItem = z.infer<typeof VisitItemSchema>;

export const TravelItemSchema = z.object({
  kind: z.literal("travel"),
  fromName: z.string(),
  toName: z.string(),
  /** True when moving between cities. */
  intercity: z.boolean(),
  start: z.number(),
  end: z.number(),
  distanceKm: z.number(),
});
export type TravelItem = z.infer<typeof TravelItemSchema>;

export const TimelineItemSchema = z.discriminatedUnion("kind", [VisitItemSchema, TravelItemSchema]);
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const DayPlanSchema = z.object({
  /** YYYY-MM-DD */
  date: z.string().regex(DATE_RE),
  /** City ids touched on this day, in order. */
  cityIds: z.array(z.string()),
  items: z.array(TimelineItemSchema),
  /** Day falls after the requested end date. */
  overBudget: z.boolean(),
  /** Planned activity runs past the requested day end. */
  overrun: z.boolean(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const RoutingSourceSchema = z.enum(["osrm", "estimate"]);
export type RoutingSource = z.infer<typeof RoutingSourceSchema>;

/** Validates plans that come back from storage or an imported file. */
export const PlanResponseSchema = z.object({
  days: z.array(DayPlanSchema),
  cityOrder: z.array(z.string()),
  summary: z.object({
    daysAvailable: z.number(),
    daysNeeded: z.number(),
    fits: z.boolean(),
    visitMinutes: z.number(),
    travelMinutes: z.number(),
    travelKm: z.number(),
  }),
  warnings: z.array(z.string()),
  routing: RoutingSourceSchema,
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export type PlaceSearchResponse = { results: Place[] };

export type ApiError = { error: string; details?: string[] };

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatTime(minutes: number): string {
  const dayOffset = Math.floor(minutes / 1440);
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return dayOffset > 0 ? `${hh}:${mm} (+${dayOffset})` : `${hh}:${mm}`;
}

export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function parseDateUtc(date: string): number {
  if (!DATE_RE.test(date)) return NaN;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== date ? NaN : t;
}

/** Number of calendar days in the trip, inclusive of both ends. */
export function tripDayCount(startDate: string, endDate: string): number {
  return Math.round((parseDateUtc(endDate) - parseDateUtc(startDate)) / 86_400_000) + 1;
}

export function addDays(date: string, days: number): string {
  return new Date(parseDateUtc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

const KIND_TO_CATEGORY: Record<string, Category> = {
  cafe: "cafe",
  coffee_shop: "cafe",
  ice_cream: "cafe",
  bakery: "cafe",
  restaurant: "restaurant",
  fast_food: "restaurant",
  food_court: "restaurant",
  bar: "nightlife",
  pub: "nightlife",
  nightclub: "nightlife",
  biergarten: "nightlife",
  museum: "museum",
  gallery: "museum",
  arts_centre: "museum",
  theme_park: "adventure",
  water_park: "adventure",
  amusement_arcade: "adventure",
  zoo: "adventure",
  aquarium: "adventure",
  climbing: "adventure",
  sports_centre: "adventure",
  park: "nature",
  garden: "nature",
  nature_reserve: "nature",
  beach: "nature",
  peak: "nature",
  viewpoint: "attraction",
  attraction: "attraction",
  monument: "attraction",
  castle: "attraction",
  memorial: "attraction",
  place_of_worship: "attraction",
  cathedral: "attraction",
  church: "attraction",
  temple: "attraction",
  ruins: "attraction",
  mall: "shopping",
  marketplace: "shopping",
  department_store: "shopping",
  clothes: "shopping",
  gift: "shopping",
  books: "shopping",
  souvenir: "shopping",
  chocolate: "shopping",
};

export function guessCategory(kind: string | undefined): Category {
  return (kind && KIND_TO_CATEGORY[kind]) || "other";
}
