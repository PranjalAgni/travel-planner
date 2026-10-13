"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { PlanResponse } from "@travel/shared";
import { dayColor } from "@/lib/format";
import type { DraftCity } from "@/lib/trip";

type Props = {
  cities: DraftCity[];
  plan: PlanResponse | null;
  selectedDay: number | null;
};

type Pin = { key: string; lat: number; lon: number; title: string; label: string; color: string; dim: boolean };

const UNPLANNED_COLOR = "#64748b";

export default function TripMap({ cities, plan, selectedDay }: Props) {
  const { pins, lines, focus } = useMemo(() => layout(cities, plan, selectedDay), [cities, plan, selectedDay]);

  return (
    <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom className="size-full" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {lines.map((line) => (
        <Polyline
          key={line.key}
          positions={line.points}
          pathOptions={{
            color: line.color,
            weight: line.intercity ? 2.5 : 3.5,
            opacity: line.dim ? 0.15 : 0.85,
            dashArray: line.intercity ? "6 8" : undefined,
          }}
        />
      ))}
      {pins.map((pin) => (
        <Marker key={pin.key} position={[pin.lat, pin.lon]} icon={pinIcon(pin)} zIndexOffset={pin.dim ? 0 : 1000}>
          <Tooltip direction="top" offset={[0, -14]}>
            {pin.title}
          </Tooltip>
        </Marker>
      ))}
      <FitBounds points={focus} />
    </MapContainer>
  );
}

type Line = { key: string; points: [number, number][]; color: string; dim: boolean; intercity: boolean };

function layout(cities: DraftCity[], plan: PlanResponse | null, selectedDay: number | null) {
  const spots = new Map(cities.flatMap((c) => c.spots.map((s) => [s.id, s.place] as const)));
  const pins: Pin[] = [];
  const lines: Line[] = [];
  /** Points the map should zoom to; everything when no day is selected. */
  const focus: { lat: number; lon: number }[] = [];

  if (!plan) {
    for (const city of cities) {
      city.spots.forEach((s, i) =>
        pins.push({ key: s.id, ...s.place, title: s.place.name, label: String(i + 1), color: UNPLANNED_COLOR, dim: false }),
      );
    }
    return { pins, lines, focus: pins };
  }

  const style = (day: number) => ({ color: dayColor(day), dim: selectedDay !== null && selectedDay !== day });
  const addFocus = (day: number, ...points: [number, number][]) => {
    if (selectedDay === null || selectedDay === day) focus.push(...points.map(([lat, lon]) => ({ lat, lon })));
  };

  let previous: { point: [number, number]; cityId: string } | null = null;
  // Day on which the latest intercity transfer happens; it can be before the next visit's day.
  let travelDay: number | null = null;

  plan.days.forEach((day, d) => {
    let segment: [number, number][] = [];
    const flush = () => {
      if (segment.length > 1) lines.push({ key: `d${d}-${lines.length}`, points: segment, ...style(d), intercity: false });
      segment = [];
    };
    let stop = 0;

    for (const item of day.items) {
      if (item.kind === "travel") {
        if (item.intercity) travelDay = d;
        continue;
      }
      const place = spots.get(item.spotId);
      if (!place) continue;
      const point: [number, number] = [place.lat, place.lon];
      pins.push({ key: item.spotId, ...place, title: `Day ${d + 1} · ${item.name}`, label: String(++stop), ...style(d) });
      addFocus(d, point);

      if (previous && previous.cityId !== item.cityId) {
        flush();
        const on = travelDay ?? d;
        lines.push({ key: `x${item.spotId}`, points: [previous.point, point], ...style(on), intercity: true });
        addFocus(on, previous.point, point);
      }
      travelDay = null;
      segment.push(point);
      previous = { point, cityId: item.cityId };
    }
    flush();
  });
  return { pins, lines, focus };
}

const iconCache = new Map<string, L.DivIcon>();

function pinIcon({ label, color, dim }: Pin): L.DivIcon {
  const key = `${label}|${color}|${dim}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<div class="trip-pin" style="background:${color};opacity:${dim ? 0.35 : 1}">${label}</div>`,
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function FitBounds({ points }: { points: { lat: number; lon: number }[] }) {
  const map = useMap();
  const signature = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";");

  useEffect(() => {
    if (!signature) return;
    const latLngs = signature.split(";").map((s) => s.split(",").map(Number) as [number, number]);
    if (latLngs.length === 1) map.flyTo(latLngs[0]!, 14, { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 15, duration: 0.6 });
  }, [map, signature]);

  return null;
}
