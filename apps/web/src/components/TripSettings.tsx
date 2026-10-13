"use client";

import { addDays, tripDayCount, type CityOrder, type Pace } from "@travel/shared";
import type { TripDraft } from "@/lib/trip";

type Props = {
  draft: TripDraft;
  onChange: (patch: Partial<TripDraft>) => void;
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none";

export function TripSettings({ draft, onChange }: Props) {
  const days = draft.startDate && draft.endDate ? tripDayCount(draft.startDate, draft.endDate) : NaN;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            className={inputClass}
            value={draft.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              // Moving the start shifts the end too, so the trip keeps its length.
              const shift = days > 0 && startDate && draft.startDate;
              onChange({ startDate, endDate: shift ? addDays(startDate, days - 1) : draft.endDate });
            }}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            className={inputClass}
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </Field>
        <Field label="Day starts">
          <input type="time" className={inputClass} value={draft.dayStart} onChange={(e) => onChange({ dayStart: e.target.value })} />
        </Field>
        <Field label="Day ends">
          <input type="time" className={inputClass} value={draft.dayEnd} onChange={(e) => onChange({ dayEnd: e.target.value })} />
        </Field>
      </div>
      {days > 0 && (
        <p className="-mt-1 text-xs text-slate-500">
          {days} day{days > 1 ? "s" : ""} of travel
        </p>
      )}

      <Segmented<Pace>
        label="Pace"
        value={draft.pace}
        onChange={(pace) => onChange({ pace })}
        options={[
          { value: "relaxed", label: "Relaxed", hint: "Spread spots over all days" },
          { value: "packed", label: "Packed", hint: "Fewest days possible" },
        ]}
      />
      <Segmented<CityOrder>
        label="City order"
        value={draft.cityOrder}
        onChange={(cityOrder) => onChange({ cityOrder })}
        options={[
          { value: "optimize", label: "Optimize", hint: "Start in city 1, best order after" },
          { value: "keep", label: "Keep my order", hint: "Visit cities as listed" },
        ]}
      />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-600">{label}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
              value === o.value ? "bg-white shadow-sm" : "hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className={`block text-sm font-medium ${value === o.value ? "text-slate-900" : "text-slate-600"}`}>{o.label}</span>
            <span className="block text-[11px] leading-tight text-slate-500">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
