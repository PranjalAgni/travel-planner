"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { SavedPlanSchema, TripDraftSchema } from "./trip";

/** A trip kept in the browser's library, with its last plan so it can be revisited offline. */
export const SavedTripSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  draft: TripDraftSchema,
  plan: SavedPlanSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SavedTrip = z.infer<typeof SavedTripSchema>;
export type TripContent = Pick<SavedTrip, "id" | "name" | "draft" | "plan">;

export type Library =
  | { status: "loading" }
  | { status: "ready"; trips: SavedTrip[]; writeFailed: boolean }
  | { status: "unavailable" };

const DB_NAME = "travel-planner";
const DB_VERSION = 1;
const STORE = "trips";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Let a later call retry instead of caching the failure forever.
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

/** Runs one transaction and resolves once it has committed. */
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const listeners = new Set<() => void>();
let library: Library = { status: "loading" };
let started = false;
let channel: BroadcastChannel | null = null;

function emit() {
  for (const listener of listeners) listener();
}

async function refresh() {
  try {
    const rows = await transact<unknown[]>("readonly", (store) => store.getAll());
    const trips = rows.flatMap((row) => {
      const parsed = SavedTripSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    trips.sort((a, b) => b.updatedAt - a.updatedAt);
    library = { status: "ready", trips, writeFailed: library.status === "ready" && library.writeFailed };
  } catch {
    library = { status: "unavailable" };
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refresh();
    // Keep other tabs' lists in sync.
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("travel-planner:trips");
      channel.onmessage = () => void refresh();
    }
  }
  return () => listeners.delete(listener);
}

async function write(work: (store: IDBObjectStore) => void) {
  try {
    await transact("readwrite", work);
  } catch (err) {
    if (library.status === "ready") library = { ...library, writeFailed: true };
    emit();
    throw err;
  }
  if (library.status === "ready") library = { ...library, writeFailed: false };
  await refresh();
  channel?.postMessage("changed");
}

let persistenceRequested = false;

/** Inserts or updates a trip, keeping its original creation time. */
export function saveTrip(trip: TripContent): Promise<void> {
  if (!persistenceRequested) {
    persistenceRequested = true;
    // Ask the browser not to evict saved trips under storage pressure.
    void navigator.storage?.persist?.().catch(() => false);
  }
  const now = Date.now();
  return write((store) => {
    const existing = store.get(trip.id);
    existing.onsuccess = () => {
      const createdAt = (existing.result as SavedTrip | undefined)?.createdAt ?? now;
      store.put({ ...trip, createdAt, updatedAt: now } satisfies SavedTrip);
    };
  });
}

export function deleteTrip(id: string): Promise<void> {
  return write((store) => void store.delete(id));
}

const serverSnapshot: Library = { status: "loading" };

export function useLibrary(): Library {
  return useSyncExternalStore(subscribe, () => library, () => serverSnapshot);
}
