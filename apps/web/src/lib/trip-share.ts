import { z } from "zod";
import { PlanResponseSchema, type PlanResponse } from "@travel/shared";
import { draftProblems, toPlanRequest, TripDraftSchema, type SavedPlan, type TripDraft } from "./trip";

/**
 * Share links carry the whole trip in the URL fragment (`#trip=1.<data>`). Browsers never
 * send the fragment to a server, so nothing is uploaded: the link is the trip.
 * `<data>` is base64url(deflate-raw(JSON)). Bump the version on breaking changes.
 */
const HASH_PREFIX = "#trip=";
const VERSION = "1";

const SharePayloadSchema = z.object({
  name: z.string().max(200),
  draft: TripDraftSchema,
  plan: PlanResponseSchema.nullable(),
});
export type SharedTrip = { name: string; draft: TripDraft; plan: SavedPlan | null };

/** Links longer than this may be cut off by some messaging apps. */
export const LONG_LINK_CHARS = 8000;

export class ShareLinkError extends Error {}

/** A plan only travels with the link if it matches the trip as it is now. */
export function isPlanCurrent(draft: TripDraft, plan: SavedPlan | null): plan is SavedPlan {
  return plan !== null && draftProblems(draft).length === 0 && plan.requestKey === JSON.stringify(toPlanRequest(draft));
}

export async function createShareLink(trip: SharedTrip, base: string): Promise<{ url: string; includesPlan: boolean }> {
  const includesPlan = isPlanCurrent(trip.draft, trip.plan);
  const payload = compact(trip.draft, includesPlan ? trip.plan!.response : null);
  const json = JSON.stringify({ name: trip.name, ...payload });
  const data = toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
  return { url: `${base}${HASH_PREFIX}${VERSION}.${data}`, includesPlan };
}

/** True when the hash looks like a share link (it may still be broken). */
export function isShareHash(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
}

export async function readShareHash(hash: string): Promise<SharedTrip> {
  const [version, data] = hash.slice(HASH_PREFIX.length).split(".");
  if (version !== VERSION || !data) throw new ShareLinkError("This share link is from a different version of the app.");
  let json: unknown;
  try {
    const bytes = await pipe(fromBase64Url(data), new DecompressionStream("deflate-raw"));
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ShareLinkError("This share link is incomplete. It may have been cut off when it was copied.");
  }
  const parsed = SharePayloadSchema.safeParse(json);
  if (!parsed.success) throw new ShareLinkError("This share link does not contain a valid trip.");
  const { name, draft, plan } = parsed.data;
  // The plan is rebuilt against this draft, so it shows as current, not stale.
  const current = plan && draftProblems(draft).length === 0 ? { requestKey: JSON.stringify(toPlanRequest(draft)), response: plan } : null;
  return { name, draft, plan: current };
}

/** Swaps random ids for short ones and trims coordinate precision to about a metre. */
function compact(draft: TripDraft, plan: PlanResponse | null): { draft: TripDraft; plan: PlanResponse | null } {
  const ids = new Map<string, string>();
  const short = (id: string, prefix: string) => {
    let next = ids.get(id);
    if (!next) ids.set(id, (next = `${prefix}${ids.size + 1}`));
    return next;
  };
  const round = <T extends { lat: number; lon: number }>(p: T): T => ({
    ...p,
    lat: Math.round(p.lat * 1e5) / 1e5,
    lon: Math.round(p.lon * 1e5) / 1e5,
  });

  const cities = draft.cities.map((city) => ({
    id: short(city.id, "c"),
    place: city.place && round(city.place),
    spots: city.spots.map((spot) => ({ ...spot, id: short(spot.id, "s"), place: round(spot.place) })),
  }));
  const compactPlan = plan && {
    ...plan,
    cityOrder: plan.cityOrder.map((id) => ids.get(id) ?? id),
    days: plan.days.map((day) => ({
      ...day,
      cityIds: day.cityIds.map((id) => ids.get(id) ?? id),
      items: day.items.map((item) =>
        item.kind === "visit" ? { ...item, spotId: ids.get(item.spotId) ?? item.spotId, cityId: ids.get(item.cityId) ?? item.cityId } : item,
      ),
    })),
  };
  return { draft: { ...draft, cities }, plan: compactPlan };
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so large trips do not overflow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
