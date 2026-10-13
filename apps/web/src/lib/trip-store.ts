"use client";

import { useSyncExternalStore } from "react";
import type { PlanResponse } from "@travel/shared";
import { defaultDraft, type TripDraft } from "./trip";

/** A plan together with the exact request that produced it, so we can tell when it is stale. */
export type SavedPlan = { requestKey: string; response: PlanResponse };

export type TripState = { draft: TripDraft; plan: SavedPlan | null };

const STORAGE_KEY = "travel-planner:v1";
const listeners = new Set<() => void>();
let state: TripState | null = null;

function load(): TripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TripState;
  } catch {
    // Corrupt or inaccessible storage: start fresh.
  }
  return { draft: defaultDraft(), plan: null };
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

export function updateTrip(update: (current: TripState) => TripState) {
  state = update(getSnapshot());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; the trip still works for this session.
  }
  for (const listener of listeners) listener();
}

export function resetTrip() {
  updateTrip(() => ({ draft: defaultDraft(), plan: null }));
}

/** Returns null until the saved trip has been read on the client. */
export function useTrip(): TripState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
