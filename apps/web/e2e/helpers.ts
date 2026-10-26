import type { Page } from "@playwright/test";
import type { Place } from "@travel/shared";

const PLACES: Record<string, Place[]> = {
  lisbon: [{ name: "Lisbon", label: "Portugal", lat: 38.7077, lon: -9.1365, kind: "city" }],
  porto: [{ name: "Porto", label: "Portugal", lat: 41.1496, lon: -8.6109, kind: "city" }],
  belem: [{ name: "Tower of Belém", label: "Lisbon, Portugal", lat: 38.6916, lon: -9.216, kind: "attraction" }],
  oceanario: [{ name: "Oceanário de Lisboa", label: "Lisbon, Portugal", lat: 38.7635, lon: -9.0937, kind: "aquarium" }],
  majestic: [{ name: "Café Majestic", label: "Porto, Portugal", lat: 41.1472, lon: -8.6062, kind: "cafe" }],
};

/** Place search depends on a public geocoder, so tests answer it with fixtures. */
export async function stubPlaceSearch(page: Page) {
  await page.route("**/api/places?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!.toLowerCase();
    const key = Object.keys(PLACES).find((k) => q.includes(k));
    return route.fulfill({ json: { results: key ? PLACES[key] : [] } });
  });
}

export async function pick(page: Page, combobox: string | RegExp, query: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}

export async function buildTrip(page: Page) {
  await page.goto("/");
  await pick(page, "City 1", "lisbon", "Lisbon");
  await pick(page, /Add a spot in Lisbon/, "belem", "Tower of Belém");
  await pick(page, /Add a spot in Lisbon/, "oceanario", "Oceanário");
  await page.getByRole("button", { name: "Add another city" }).click();
  await pick(page, "City 2", "porto", "Porto");
  await pick(page, /Add a spot in Porto/, "majestic", "Café Majestic");
}
