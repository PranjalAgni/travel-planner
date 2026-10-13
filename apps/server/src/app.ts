import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import { PlanRequestSchema, type ApiError, type PlaceSearchResponse, type PlanResponse } from "@travel/shared";
import type { PlaceSearchProvider } from "./places/photon.js";
import { buildPlan, matrixPoints } from "./planner/schedule.js";
import type { TravelMatrixProvider } from "./routing/types.js";

export type AppDeps = {
  places: PlaceSearchProvider;
  routing: TravelMatrixProvider;
};

const PlaceQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(200),
  kind: z.enum(["city", "spot"]).default("spot"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

export function createApp({ places, routing }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/places", async (req, res) => {
    const parsed = PlaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error));
      return;
    }
    const { q, kind, lat, lon } = parsed.data;
    const near = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    try {
      const results = await places.search(q, { kind, near });
      res.json({ results } satisfies PlaceSearchResponse);
    } catch (err) {
      console.error("place search failed", err);
      res.status(502).json({ error: "Place search is unavailable right now. Try again in a moment." } satisfies ApiError);
    }
  });

  app.post("/api/plan", async (req, res) => {
    const parsed = PlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error));
      return;
    }
    const matrix = await routing.matrix(matrixPoints(parsed.data));
    const plan = buildPlan(parsed.data, matrix);
    res.json({ ...plan, routing: matrix.source } satisfies PlanResponse);
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body is not valid JSON" } satisfies ApiError);
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong" } satisfies ApiError);
  };
  app.use(onError);

  return app;
}

function validationError(error: z.ZodError): ApiError {
  return {
    error: "Invalid request",
    details: error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
  };
}
