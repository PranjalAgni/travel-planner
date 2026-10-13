import { describe, expect, it, vi } from "vitest";
import { FallbackProvider, OsrmProvider } from "../src/routing/osrm.js";
import { EstimateProvider } from "../src/routing/estimate.js";
import type { LatLon } from "../src/routing/types.js";

/** Fake OSRM table: 60 seconds and 1 km per unit of longitude difference. */
function fakeOsrm(options: { unroutable?: [number, number] } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const coords = url.pathname.split("/").at(-1)!.split(";").map((c) => c.split(",").map(Number) as [number, number]);
    expect(coords.length).toBeLessThanOrEqual(100);
    const sources = url.searchParams.get("sources")!.split(";").map(Number);
    const destinations = url.searchParams.get("destinations")!.split(";").map(Number);
    const value = (scale: number) =>
      sources.map((s) =>
        destinations.map((d) => {
          const [a, b] = [coords[s]![0], coords[d]![0]];
          if (options.unroutable && a === options.unroutable[0] && b === options.unroutable[1]) return null;
          return Math.abs(a - b) * scale;
        }),
      );
    return new Response(JSON.stringify({ code: "Ok", durations: value(60), distances: value(1000) }));
  });
}

const points = (n: number): LatLon[] => Array.from({ length: n }, (_, i) => ({ lat: 0, lon: i }));

describe("OsrmProvider", () => {
  it("splits large matrices into requests the public server accepts", async () => {
    const fetchImpl = fakeOsrm();
    const matrix = await new OsrmProvider("http://osrm", 1000, fetchImpl).matrix(points(120));
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(matrix.source).toBe("osrm");
    expect(matrix.minutes[3]![117]).toBe(114);
    expect(matrix.km[117]![3]).toBe(114);
  });

  it("estimates pairs that have no road route", async () => {
    const pts = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }];
    const matrix = await new OsrmProvider("http://osrm", 1000, fakeOsrm({ unroutable: [0, 1] })).matrix(pts);
    expect(matrix.km[0]![1]).toBeGreaterThan(100);
    expect(matrix.minutes[1]![0]).toBe(1);
  });

  it("falls back to estimates when OSRM fails", async () => {
    const failing = vi.fn(async () => new Response(JSON.stringify({ code: "TooBig", message: "too big" }), { status: 400 }));
    const onFallback = vi.fn();
    const provider = new FallbackProvider(new OsrmProvider("http://osrm", 1000, failing), new EstimateProvider(), onFallback);
    const matrix = await provider.matrix(points(3));
    expect(matrix.source).toBe("estimate");
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ message: "OSRM 400: too big" }));
  });
});
