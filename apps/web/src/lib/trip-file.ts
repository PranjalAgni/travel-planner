import { z } from "zod";
import { newId, SavedPlanSchema, TripDraftSchema } from "./trip";
import type { SavedTrip, TripContent } from "./trip-library";

/** On-disk format for exported trips. Bump `version` on breaking changes and migrate on import. */
const TripFileSchema = z.object({
  format: z.literal("travel-planner-trip"),
  version: z.literal(1),
  name: z.string(),
  draft: TripDraftSchema,
  plan: SavedPlanSchema.nullable(),
});
type TripFile = z.infer<typeof TripFileSchema>;

export class TripFileError extends Error {}

export function tripFileName(trip: SavedTrip): string {
  const slug = trip.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "trip"}.trip.json`;
}

export function downloadTrip(trip: SavedTrip) {
  const file: TripFile = { format: "travel-planner-trip", version: 1, name: trip.name, draft: trip.draft, plan: trip.plan };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = tripFileName(trip);
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads an exported trip. Imports always get a new id so they never overwrite an existing trip. */
export async function readTripFile(file: File): Promise<TripContent> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new TripFileError(`${file.name} is not a trip file.`);
  }
  const parsed = TripFileSchema.safeParse(json);
  if (!parsed.success) throw new TripFileError(`${file.name} is not a trip file from this app.`);
  const { name, draft, plan } = parsed.data;
  return { id: newId(), name, draft, plan };
}
