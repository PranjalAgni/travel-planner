"use client";

import { useRef, useState } from "react";
import { suggestTripName } from "@/lib/trip";
import { createShareLink, LONG_LINK_CHARS } from "@/lib/trip-share";
import type { TripState } from "@/lib/trip-store";
import { buttonClass, Modal } from "./Modal";

type Link = { url: string; includesPlan: boolean };

/** Share dialog for the open trip. `share()` opens it with a link to the trip as it is now. */
export function useShareDialog(trip: TripState) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const attempt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const name = trip.name.trim() || suggestTripName(trip.draft);

  function share() {
    const id = ++attempt.current;
    setOpen(true);
    setLink(null);
    setFailed(false);
    setCopied(false);
    createShareLink({ name, draft: trip.draft, plan: trip.plan }, `${location.origin}${location.pathname}`).then(
      // Ignore results from an earlier opening of the dialog.
      (created) => id === attempt.current && setLink(created),
      () => id === attempt.current && setFailed(true),
    );
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the text so the user can copy it by hand.
      input.current?.select();
    }
  }

  const canShareNatively = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const dialog = (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Share this trip"
      footer={
        <>
          {canShareNatively && (
            <button
              type="button"
              className={`${buttonClass.secondary} mr-auto`}
              disabled={!link}
              onClick={() => link && navigator.share({ title: name, url: link.url }).catch(() => {})}
            >
              More options...
            </button>
          )}
          <button type="button" className={buttonClass.primary} disabled={!link} onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Anyone with this link sees <span className="font-medium text-slate-900">{name}</span>
        {link?.includesPlan ? " with its day-by-day plan" : ""} and can save their own copy. The whole trip is inside the
        link, nothing is uploaded.
      </p>
      {link && !link.includesPlan && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {trip.plan ? "The plan is out of date, so it is not included." : "This trip has not been planned yet."} They can
          plan it when they open it, or plan it first and share again.
        </p>
      )}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Link</span>
        <input
          ref={input}
          readOnly
          value={failed ? "" : (link?.url ?? "Creating link...")}
          onFocus={(e) => e.target.select()}
          className="h-10 w-full truncate rounded-lg border border-slate-300 bg-slate-50 px-3 font-mono text-xs text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
      </label>
      {failed && <p className="mt-2 text-sm text-rose-700">Could not create a link in this browser.</p>}
      {link && link.url.length > LONG_LINK_CHARS && (
        <p className="mt-2 text-xs text-slate-500">
          This link is long ({link.url.length.toLocaleString()} characters). Some messaging apps cut long links off; if it
          does not open, export the trip as a file from My trips instead.
        </p>
      )}
    </Modal>
  );

  return { share, dialog };
}
