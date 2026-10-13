import type { LatLon, TravelMatrix, TravelMatrixProvider } from "./types.js";

/** Roads are rarely straight; this converts straight-line distance to road distance. */
export const ROAD_FACTOR = 1.3;
const CITY_SPEED_KMH = 25;
const HIGHWAY_SPEED_KMH = 70;
const CITY_RADIUS_KM = 20;

export function haversineKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function estimateMinutes(km: number): number {
  const cityKm = Math.min(km, CITY_RADIUS_KM);
  const highwayKm = km - cityKm;
  return Math.ceil((cityKm / CITY_SPEED_KMH + highwayKm / HIGHWAY_SPEED_KMH) * 60);
}

/** Offline fallback: straight-line distance with typical driving speeds. */
export class EstimateProvider implements TravelMatrixProvider {
  async matrix(points: LatLon[]): Promise<TravelMatrix> {
    const km = points.map((a) => points.map((b) => haversineKm(a, b) * ROAD_FACTOR));
    return { km, minutes: km.map((row) => row.map(estimateMinutes)), source: "estimate" };
  }
}
