"use client";

import { useRef, useState } from "react";
import { tripDayCount } from "@travel/shared";
import { formatDateRange, formatRelative } from "@/lib/format";
import { uniqueName } from "@/lib/trip";
import { downloadTrip, readTripFile, TripFileError } from "@/lib/trip-file";
import { saveTrip, useLibrary, type SavedTrip } from "@/lib/trip-library";
import { newTrip, openTrip, removeSavedTrip, useTrip } from "@/lib/trip-store";
import { useDiscardGuard } from "./DiscardGuard";
import { buttonClass, Modal } from "./Modal";

/** Header button that opens the library of saved trips. */
export function TripsMenu() {
  const library = useLibrary();
  const trip = useTrip();
  const { guard, dialog } = useDiscardGuard();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<SavedTrip | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const trips = library.status === "ready" ? library.trips : [];

  const close = () => {
    setOpen(false);
    setNotice(null);
  };

  async function onImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imported: string[] = [];
    const errors: string[] = [];
    const taken = trips.map((t) => t.name);
    for (const file of Array.from(files)) {
      try {
        const content = await readTripFile(file);
        content.name = uniqueName(content.name, [...taken, ...imported]);
        await saveTrip(content);
        imported.push(content.name);
      } catch (err) {
        errors.push(err instanceof TripFileError ? err.message : `Could not import ${file.name}.`);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
    setNotice(
      errors.length > 0
        ? { tone: "bad", text: errors.join(" ") }
        : { tone: "good", text: imported.length === 1 ? `Imported "${imported[0]}".` : `Imported ${imported.length} trips.` },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" className="size-4">
          <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3.4l1.6 1.75h6A1.5 1.5 0 0 1 17 8.25v6.25A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-8Z" />
        </svg>
        My trips
        {trips.length > 0 && (
          <span className="min-w-5 rounded-full bg-slate-100 px-1.5 text-center text-xs font-semibold text-slate-600 tabular-nums">
            {trips.length}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={close}
        title="My trips"
        width="max-w-lg"
        footer={
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Trip files to import"
              onChange={(e) => void onImport(e.target.files)}
            />
            <button
              type="button"
              className={`${buttonClass.secondary} mr-auto`}
              disabled={library.status !== "ready"}
              onClick={() => fileInput.current?.click()}
            >
              Import from file
            </button>
            <button
              type="button"
              className={buttonClass.primary}
              onClick={() =>
                guard(() => {
                  newTrip();
                  close();
                })
              }
            >
              New trip
            </button>
          </>
        }
      >
        {notice && (
          <p
            role="status"
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              notice.tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {notice.text}
          </p>
        )}
        {library.status === "loading" ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading your trips...</p>
        ) : library.status === "unavailable" ? (
          <p className="py-8 text-center text-sm text-slate-500">
            This browser is blocking storage (private browsing can do this), so trips cannot be saved here.
          </p>
        ) : trips.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-slate-900">No saved trips yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
              Use Save trip to keep the one you are working on, or import a trip file.
            </p>
          </div>
        ) : (
          <ul className="-mx-2 space-y-1">
            {trips.map((t) => (
              <TripRow
                key={t.id}
                trip={t}
                current={trip?.savedId === t.id}
                onOpen={() =>
                  guard(() => {
                    openTrip(t);
                    close();
                  })
                }
                onExport={() => downloadTrip(t)}
                onDelete={() => setDeleting(t)}
              />
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete trip?"
        width="max-w-sm"
        footer={
          <>
            <button type="button" className={buttonClass.secondary} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={buttonClass.danger}
              onClick={async () => {
                const target = deleting;
                setDeleting(null);
                if (!target) return;
                try {
                  await removeSavedTrip(target.id);
                } catch {
                  setNotice({ tone: "bad", text: `Could not delete "${target.name}".` });
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{deleting?.name}</span> will be removed from this browser. Export it first
          if you might want it back.
        </p>
      </Modal>

      {dialog}
    </>
  );
}

function TripRow({
  trip,
  current,
  onOpen,
  onExport,
  onDelete,
}: {
  trip: SavedTrip;
  current: boolean;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { draft } = trip;
  const cities = draft.cities.flatMap((c) => (c.place ? [c.place.name] : []));
  const spots = draft.cities.reduce((n, c) => n + c.spots.length, 0);
  const days = tripDayCount(draft.startDate, draft.endDate);

  return (
    <li className={`group flex items-center gap-1 rounded-xl pr-1 transition ${current ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{trip.name}</span>
          {current && (
            <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Open</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-600">
          {cities.length > 0 ? cities.join(" → ") : "No cities yet"} · {spots} spot{spots === 1 ? "" : "s"}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {formatDateRange(draft.startDate, draft.endDate)}
          {days > 0 && ` · ${days} day${days > 1 ? "s" : ""}`}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">
          {trip.plan ? "Planned" : "Not planned yet"} · Edited {formatRelative(trip.updatedAt)}
        </span>
      </button>
      <RowAction label={`Export ${trip.name}`} onClick={onExport}>
        <path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
      </RowAction>
      <RowAction label={`Delete ${trip.name}`} onClick={onDelete}>
        <path d="M4.5 6h11M8 6V4.5h4V6m-6 0 .75 9.5h6.5L14 6" />
      </RowAction>
    </li>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label.split(" ")[0]}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="size-4">
        {children}
      </svg>
    </button>
  );
}
