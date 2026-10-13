import type { Place } from "@travel/shared";

export type PlaceKind = "city" | "spot";

export type SearchOptions = {
  kind: PlaceKind;
  /** Biases results towards this point (e.g. the city a spot belongs to). */
  near?: { lat: number; lon: number };
  limit?: number;
};

export interface PlaceSearchProvider {
  search(query: string, options: SearchOptions): Promise<Place[]>;
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

/** OSM keys for things people visit (as opposed to the building they are in). */
const POI_KEYS = new Set(["amenity", "tourism", "shop", "leisure", "historic", "natural", "craft"]);

/** Layers that make sense as a travel destination rather than a single venue. */
const DESTINATION_LAYERS = ["city", "locality", "district", "county", "state"];

export class PhotonProvider implements PlaceSearchProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string, { kind, near, limit = 6 }: SearchOptions): Promise<Place[]> {
    const url = new URL(`${this.baseUrl}/api/`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    // Without a language Photon only matches local names ("Lisboa"), so "Lisbon" finds towns in the US.
    url.searchParams.set("lang", "en");
    if (kind === "city") for (const layer of DESTINATION_LAYERS) url.searchParams.append("layer", layer);
    if (near) {
      url.searchParams.set("lat", near.lat.toFixed(5));
      url.searchParams.set("lon", near.lon.toFixed(5));
    }

    const res = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { "User-Agent": "travel-planner (personal experiment)" },
    });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const features = (body.features ?? []).filter((f) => f.properties.name);
    if (kind === "spot") {
      // Photon often ranks the building footprint above the cafe or shop inside it; the
      // POI carries the useful category, so rank POIs first (stable sort keeps relevance otherwise).
      features.sort((a, b) => Number(!POI_KEYS.has(a.properties.osm_key ?? "")) - Number(!POI_KEYS.has(b.properties.osm_key ?? "")));
    }
    const results = features.map(toPlace);
    return dedupe(kind === "city" ? preferSettlements(results) : results);
  }
}

function toPlace(feature: PhotonFeature): Place {
  const p = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : undefined;
  const parts = [street, p.locality ?? p.district, p.city, p.state, p.country].filter(
    (part, i, all): part is string => !!part && part !== p.name && all.indexOf(part) === i,
  );
  return { name: p.name!, label: parts.join(", "), lat, lon, kind: p.osm_value };
}

/**
 * Administrative areas often share a name with their main city ("Lisbon" the
 * district vs. the city) but their centroid can be far from where people go.
 * Rank real settlements first; the sort is stable so Photon's relevance order is kept otherwise.
 */
function preferSettlements(places: Place[]): Place[] {
  return [...places].sort((a, b) => Number(a.kind === "administrative") - Number(b.kind === "administrative"));
}

function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.name}|${p.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Caches search results in memory; place data changes rarely. */
export class CachedSearchProvider implements PlaceSearchProvider {
  private readonly cache = new Map<string, { at: number; places: Place[] }>();

  constructor(
    private readonly inner: PlaceSearchProvider,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 2000,
  ) {}

  async search(query: string, options: SearchOptions): Promise<Place[]> {
    const near = options.near ? `${options.near.lat.toFixed(2)},${options.near.lon.toFixed(2)}` : "";
    const key = `${options.kind}|${near}|${options.limit ?? ""}|${query.trim().toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.places;

    const places = await this.inner.search(query, options);
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), places });
    return places;
  }
}
