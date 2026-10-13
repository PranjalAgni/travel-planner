"use client";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_DURATION_MINUTES,
  guessCategory,
  type Category,
  type Place,
  type Spot,
} from "@travel/shared";
import { DURATION_OPTIONS } from "@/lib/format";
import { newId, type DraftCity } from "@/lib/trip";
import { CategoryIcon } from "./CategoryIcon";
import { PlaceSearch } from "./PlaceSearch";

type Props = {
  city: DraftCity;
  index: number;
  total: number;
  showReorder: boolean;
  onChange: (city: DraftCity) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
};

export function CityCard({ city, index, total, showReorder, onChange, onRemove, onMove }: Props) {
  const addSpot = (place: Place) => {
    const category = guessCategory(place.kind);
    const spot: Spot = { id: newId(), place, category, durationMinutes: DEFAULT_DURATION_MINUTES[category] };
    onChange({ ...city, spots: [...city.spots, spot] });
  };
  const updateSpot = (spot: Spot) => onChange({ ...city, spots: city.spots.map((s) => (s.id === spot.id ? spot : s)) });
  const removeSpot = (id: string) => onChange({ ...city, spots: city.spots.filter((s) => s.id !== id) });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {city.place ? (
            <>
              <h3 className="truncate text-sm font-semibold text-slate-900">{city.place.name}</h3>
              {city.place.label && <p className="truncate text-xs text-slate-500">{city.place.label}</p>}
            </>
          ) : (
            <PlaceSearch
              kind="city"
              label={`City ${index + 1}`}
              placeholder="Search a city or region"
              onSelect={(place) => onChange({ ...city, place })}
              autoFocus={index > 0}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {city.place && (
            <IconButton label="Change city" onClick={() => onChange({ ...city, place: null })}>
              <path d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5Z" />
            </IconButton>
          )}
          {showReorder && (
            <>
              <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
                <path d="M10 15V5m0 0-4.5 4.5M10 5l4.5 4.5" />
              </IconButton>
              <IconButton label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>
                <path d="M10 5v10m0 0-4.5-4.5M10 15l4.5-4.5" />
              </IconButton>
            </>
          )}
          <IconButton label="Remove city" disabled={total === 1} onClick={onRemove}>
            <path d="M5 5l10 10M15 5 5 15" />
          </IconButton>
        </div>
      </header>

      {city.place && (
        <div className="space-y-2 p-4">
          {city.spots.length > 0 && (
            <ul className="space-y-2">
              {city.spots.map((spot) => (
                <SpotRow key={spot.id} spot={spot} onChange={updateSpot} onRemove={() => removeSpot(spot.id)} />
              ))}
            </ul>
          )}
          <PlaceSearch
            kind="spot"
            label={`Add a spot in ${city.place.name}`}
            placeholder={`Add a spot in ${city.place.name} - cafe, park, museum...`}
            near={city.place}
            onSelect={addSpot}
          />
        </div>
      )}
    </section>
  );
}

function SpotRow({ spot, onChange, onRemove }: { spot: Spot; onChange: (s: Spot) => void; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 py-2 pr-1.5 pl-3">
      <CategoryIcon category={spot.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900" title={spot.place.name}>
          {spot.place.name}
        </div>
        <div className="mt-1 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-1.5">
          <select
            aria-label={`Category of ${spot.place.name}`}
            value={spot.category}
            onChange={(e) => onChange({ ...spot, category: e.target.value as Category })}
            className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white pr-6 pl-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            aria-label={`Time to spend at ${spot.place.name}`}
            value={spot.durationMinutes}
            onChange={(e) => onChange({ ...spot, durationMinutes: Number(e.target.value) })}
            className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white pr-6 pl-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <IconButton label={`Remove ${spot.place.name}`} onClick={onRemove}>
        <path d="M5 5l10 10M15 5 5 15" />
      </IconButton>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        {children}
      </svg>
    </button>
  );
}
