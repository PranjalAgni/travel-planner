import type { ApiError, Place, PlaceSearchResponse, PlanRequest, PlanResponse } from "@travel/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError("Can't reach the planner server. Is it running?");
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || body === null) {
    const error = body as ApiError | null;
    throw new ApiRequestError(error?.error ?? `Request failed (${res.status})`, error?.details);
  }
  return body as T;
}

export async function searchPlaces(
  query: string,
  kind: "city" | "spot",
  near: { lat: number; lon: number } | undefined,
  signal: AbortSignal,
): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, kind });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  const { results } = await call<PlaceSearchResponse>(`/api/places?${params}`, { signal });
  return results;
}

export function planTrip(request: PlanRequest): Promise<PlanResponse> {
  return call<PlanResponse>("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
