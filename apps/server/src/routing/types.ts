import type { RoutingSource } from "@travel/shared";

export type LatLon = { lat: number; lon: number };

/** Square matrices indexed [from][to]. */
export type TravelMatrix = {
  minutes: number[][];
  km: number[][];
  source: RoutingSource;
};

export interface TravelMatrixProvider {
  matrix(points: LatLon[]): Promise<TravelMatrix>;
}
