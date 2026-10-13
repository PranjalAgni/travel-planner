"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@travel/shared";
import { ApiRequestError, searchPlaces } from "@/lib/api";

const DEBOUNCE_MS = 300;

type Props = {
  kind: "city" | "spot";
  label: string;
  placeholder: string;
  near?: { lat: number; lon: number };
  onSelect: (place: Place) => void;
  autoFocus?: boolean;
};

type Status = { state: "idle" } | { state: "loading" } | { state: "done"; results: Place[] } | { state: "error"; message: string };

export function PlaceSearch({ kind, label, placeholder, near, onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const nearLat = near?.lat;
  const nearLon = near?.lon;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus({ state: "loading" });
      const bias = nearLat !== undefined && nearLon !== undefined ? { lat: nearLat, lon: nearLon } : undefined;
      searchPlaces(q, kind, bias, controller.signal)
        .then((results) => {
          setStatus({ state: "done", results });
          setActive(0);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setStatus({ state: "error", message: err instanceof ApiRequestError ? err.message : "Search failed" });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, nearLat, nearLon]);

  const tooShort = query.trim().length < 2;
  const results = !tooShort && status.state === "done" ? status.results : [];
  const showList = open && !tooShort && status.state !== "idle";

  function choose(place: Place) {
    onSelect(place);
    setQuery("");
    setStatus({ state: "idle" });
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && showList && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="relative">
        <SearchIcon />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
        {status.state === "loading" && !tooShort && (
          <span className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-[1100] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {status.state === "error" && <li className="px-3 py-2 text-sm text-rose-600">{status.message}</li>}
          {status.state === "loading" && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Searching...</li>
          )}
          {status.state === "done" && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No places found. Try adding the area or city name.</li>
          )}
          {results.map((place, i) => (
            <li
              key={`${place.lat},${place.lon},${place.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Prevent the input from blurring before the click registers.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(place)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-indigo-50" : ""}`}
            >
              <div className="truncate text-sm font-medium text-slate-900">{place.name}</div>
              {place.label && <div className="truncate text-xs text-slate-500">{place.label}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
