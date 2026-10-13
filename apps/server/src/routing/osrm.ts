import { estimateMinutes, haversineKm, ROAD_FACTOR } from "./estimate.js";
import type { LatLon, TravelMatrix, TravelMatrixProvider } from "./types.js";

/** The public OSRM server rejects tables with more than 100 coordinates. */
const MAX_COORDS_PER_REQUEST = 100;

type OsrmTable = {
  code: string;
  message?: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
};

export class OsrmProvider implements TravelMatrixProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async matrix(points: LatLon[]): Promise<TravelMatrix> {
    const n = points.length;
    const minutes = points.map(() => new Array<number>(n).fill(0));
    const km = points.map(() => new Array<number>(n).fill(0));
    const block = Math.floor(MAX_COORDS_PER_REQUEST / 2);

    for (let s = 0; s < n; s += block) {
      for (let d = 0; d < n; d += block) {
        const sources = range(s, Math.min(n, s + block));
        const destinations = range(d, Math.min(n, d + block));
        const ids = [...new Set([...sources, ...destinations])];
        const table = await this.table(
          ids.map((i) => points[i]!),
          sources.map((i) => ids.indexOf(i)),
          destinations.map((i) => ids.indexOf(i)),
        );
        sources.forEach((from, si) =>
          destinations.forEach((to, di) => {
            const seconds = table.durations?.[si]?.[di];
            const meters = table.distances?.[si]?.[di];
            if (seconds == null || meters == null) {
              // No road connection (e.g. across a sea): fall back to an estimate for this pair only.
              km[from]![to] = haversineKm(points[from]!, points[to]!) * ROAD_FACTOR;
              minutes[from]![to] = estimateMinutes(km[from]![to]!);
            } else {
              minutes[from]![to] = Math.ceil(seconds / 60);
              km[from]![to] = meters / 1000;
            }
          }),
        );
      }
    }
    return { minutes, km, source: "osrm" };
  }

  private async table(coords: LatLon[], sources: number[], destinations: number[]): Promise<OsrmTable> {
    const path = coords.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const url = new URL(`${this.baseUrl}/table/v1/driving/${path}`);
    url.searchParams.set("annotations", "duration,distance");
    url.searchParams.set("sources", sources.join(";"));
    url.searchParams.set("destinations", destinations.join(";"));

    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    const body = (await res.json()) as OsrmTable;
    if (!res.ok || body.code !== "Ok") {
      throw new Error(`OSRM ${res.status}: ${body.message ?? body.code}`);
    }
    return body;
  }
}

/** Uses the primary provider and falls back to the secondary if it fails. */
export class FallbackProvider implements TravelMatrixProvider {
  constructor(
    private readonly primary: TravelMatrixProvider,
    private readonly fallback: TravelMatrixProvider,
    private readonly onFallback: (err: unknown) => void = () => {},
  ) {}

  async matrix(points: LatLon[]): Promise<TravelMatrix> {
    try {
      return await this.primary.matrix(points);
    } catch (err) {
      this.onFallback(err);
      return this.fallback.matrix(points);
    }
  }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}
