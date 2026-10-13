import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PlaceSearchProvider } from "../src/places/photon.js";
import { EstimateProvider } from "../src/routing/estimate.js";
import { city, request as planRequest } from "./fixtures.js";

const places: PlaceSearchProvider = {
  search: vi.fn(async (q: string) => [{ name: q, label: "Somewhere", lat: 1, lon: 2, kind: "cafe" }]),
};

const app = createApp({ places, routing: new EstimateProvider() });

describe("API", () => {
  it("searches places", async () => {
    const res = await request(app).get("/api/places").query({ q: "Cafe de Flore", kind: "spot", lat: 48.8, lon: 2.3 });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ name: "Cafe de Flore" });
    expect(places.search).toHaveBeenCalledWith("Cafe de Flore", { kind: "spot", near: { lat: 48.8, lon: 2.3 } });
  });

  it("rejects too short place queries", async () => {
    const res = await request(app).get("/api/places").query({ q: "a" });
    expect(res.status).toBe(400);
  });

  it("returns 502 when place search fails", async () => {
    const failing = createApp({
      places: { search: async () => Promise.reject(new Error("down")) },
      routing: new EstimateProvider(),
    });
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await request(failing).get("/api/places").query({ q: "Paris" });
    expect(res.status).toBe(502);
  });

  it("plans a trip", async () => {
    const body = planRequest({ cities: [city("Paris", 2.35, [{ name: "Louvre", x: 2.34, y: 48.86 }])] });
    const res = await request(app).post("/api/plan").send(body);
    expect(res.status).toBe(200);
    expect(res.body.routing).toBe("estimate");
    expect(res.body.days).toHaveLength(3);
  });

  it("validates plan requests", async () => {
    const body = planRequest({ endDate: "2026-10-01", cities: [] });
    const res = await request(app).post("/api/plan").send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/End date/), expect.stringMatching(/at least one city/)]),
    );
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app).post("/api/plan").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
  });
});
