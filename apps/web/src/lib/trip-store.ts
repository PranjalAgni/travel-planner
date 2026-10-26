"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { newId, defaultDraft, SavedPlanSchema, suggestTripName, TripDraftSchema } from "./trip";
import { deleteTrip, saveTrip, type SavedTrip } from "./trip-library";

/**
 * The trip open in the editor. `savedId` links it to a trip in the library;
 * while linked, every change is written through to the library as well.
 */
const TripStateSchema = z.object({
  draft: TripDraftSchema,
  plan: SavedPlanSchema.nullable(),
  // Defaults keep trips stored before the library existed loadable.
  savedId: z.string().nullable().default(null),
  name: z.string().default(""),
  /** Opened from a share link and not saved yet. */
  shared: z.boolean().default(false),
});
export type TripState = z.infer<typeof TripStateSchema>;

const STORAGE_KEY = "travel-planner:v1";
const listeners = new Set<() => void>();
let state: TripState | null = null;

function blankState(): TripState {
  return { draft: defaultDraft(), plan: null, savedId: null, name: "", shared: false };
}

function load(): TripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = TripStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Corrupt or inaccessible storage: start fresh.
  }
  return blankState();
}

function getSnapshot(): TripState {
  state ??= load();
  return state;
}

/** During server rendering there is no saved trip; the client fills it in on hydration. */
const serverSnapshot: TripState | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: TripState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; the trip still works for this session.
  }
  for (const listener of listeners) listener();
}

/** Applies an edit to the open trip, writing it through to the library if it is saved there. */
export function updateTrip(update: (current: TripState) => TripState) {
  const next = update(getSnapshot());
  setState(next);
  if (next.savedId) {
    // Failures are surfaced through the library's `writeFailed` flag.
    saveTrip({ id: next.savedId, name: next.name.trim() || suggestTripName(next.draft), draft: next.draft, plan: next.plan }).catch(
      () => {},
    );
  }
}

/** Adds the open trip to the library and links it, so later edits save automatically. */
export async function saveCurrentTrip() {
  const current = getSnapshot();
  const saved = { id: newId(), name: current.name.trim() || suggestTripName(current.draft) };
  await saveTrip({ ...saved, draft: current.draft, plan: current.plan });
  // Goes through updateTrip so edits made while saving are written too.
  updateTrip((s) => ({ ...s, savedId: saved.id, name: saved.name }));
}

export function openTrip(trip: SavedTrip) {
  setState({ draft: trip.draft, plan: trip.plan, savedId: trip.id, name: trip.name, shared: false });
}

/** Opens a trip from a share link as a new, unsaved trip. */
export function openSharedTrip(trip: Pick<TripState, "name" | "draft" | "plan">) {
  setState({ ...trip, savedId: null, shared: true });
}

/** The open trip right now, for event handlers that must not act on a stale render. */
export function getTrip(): TripState {
  return getSnapshot();
}

export function newTrip() {
  setState(blankState());
}

/** Deletes a trip from the library. If it is open, it stays open as an unsaved trip. */
export async function removeSavedTrip(id: string) {
  await deleteTrip(id);
  const current = getSnapshot();
  if (current.savedId === id) setState({ ...current, savedId: null });
}

/** Returns null until the saved trip has been read on the client. */
export function useTrip(): TripState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
