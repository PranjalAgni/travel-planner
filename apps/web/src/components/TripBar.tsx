"use client";

import { useState } from "react";
import { isBlankDraft, suggestTripName } from "@/lib/trip";
import { useLibrary } from "@/lib/trip-library";
import { newTrip, saveCurrentTrip, updateTrip, type TripState } from "@/lib/trip-store";
import { useDiscardGuard } from "./DiscardGuard";
import { buttonClass } from "./Modal";
import { useShareDialog } from "./ShareDialog";

/** Name of the open trip, whether it is saved, and the save / new trip actions. */
export function TripBar({ trip }: { trip: TripState }) {
  const library = useLibrary();
  const { guard, dialog } = useDiscardGuard();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const sharing = useShareDialog(trip);

  const unavailable = library.status === "unavailable";
  const blank = isBlankDraft(trip.draft);

  async function onSave() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveCurrentTrip();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const status = trip.savedId
    ? library.status === "ready" && library.writeFailed
      ? { tone: "bad", text: "Could not save latest changes" }
      : { tone: "good", text: "Saved to My trips" }
    : unavailable
      ? { tone: "muted", text: "Saving is blocked in this browser" }
      : saveFailed
        ? { tone: "bad", text: "Saving failed" }
        : trip.shared
          ? { tone: "muted", text: "Shared with you, not saved" }
          : { tone: "muted", text: "Not saved yet" };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          aria-label="Trip name"
          value={trip.name}
          placeholder={suggestTripName(trip.draft)}
          maxLength={80}
          onChange={(e) => updateTrip((s) => ({ ...s, name: e.target.value }))}
          className="-ml-1.5 h-9 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 text-lg font-semibold tracking-tight text-slate-900 transition placeholder:text-slate-400 hover:border-slate-200 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
        {!blank && (
          <button type="button" aria-label="Share trip" title="Share trip" onClick={sharing.share} className={buttonClass.icon}>
            <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
              <path d="M10 12.5V3m0 0L6.5 6.5M10 3l3.5 3.5M6.5 9H5.5A1.5 1.5 0 0 0 4 10.5v5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 9h-1" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p
          role="status"
          title={trip.savedId ? "Changes save automatically" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-1 text-xs ${
            status.tone === "good" ? "text-emerald-700" : status.tone === "bad" ? "text-rose-700" : "text-slate-500"
          }`}
        >
          {status.tone === "good" && (
            <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
              <path d="m4.5 10.5 3.5 3.5 7.5-8" />
            </svg>
          )}
          <span className="truncate">{status.text}</span>
        </p>
        {(!blank || trip.savedId) && (
          <button type="button" className={buttonClass.secondary} onClick={() => guard(newTrip)}>
            New trip
          </button>
        )}
        {!trip.savedId && (
          <button type="button" className={buttonClass.primary} onClick={onSave} disabled={saving || blank || unavailable}>
            {saving ? "Saving..." : "Save trip"}
          </button>
        )}
      </div>
      {dialog}
      {sharing.dialog}
    </div>
  );
}
