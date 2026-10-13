import { expect, test, type Page } from "@playwright/test";
import type { Place } from "@travel/shared";

const PLACES: Record<string, Place[]> = {
  lisbon: [{ name: "Lisbon", label: "Portugal", lat: 38.7077, lon: -9.1365, kind: "city" }],
  porto: [{ name: "Porto", label: "Portugal", lat: 41.1496, lon: -8.6109, kind: "city" }],
  belem: [{ name: "Tower of Belém", label: "Lisbon, Portugal", lat: 38.6916, lon: -9.216, kind: "attraction" }],
  oceanario: [{ name: "Oceanário de Lisboa", label: "Lisbon, Portugal", lat: 38.7635, lon: -9.0937, kind: "aquarium" }],
  majestic: [{ name: "Café Majestic", label: "Porto, Portugal", lat: 41.1472, lon: -8.6062, kind: "cafe" }],
};

/** Place search depends on a public geocoder, so tests answer it with fixtures. */
async function stubPlaceSearch(page: Page) {
  await page.route("**/api/places?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!.toLowerCase();
    const key = Object.keys(PLACES).find((k) => q.includes(k));
    return route.fulfill({ json: { results: key ? PLACES[key] : [] } });
  });
}

async function pick(page: Page, combobox: string | RegExp, query: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}

async function buildTrip(page: Page) {
  await page.goto("/");
  await pick(page, "City 1", "lisbon", "Lisbon");
  await pick(page, /Add a spot in Lisbon/, "belem", "Tower of Belém");
  await pick(page, /Add a spot in Lisbon/, "oceanario", "Oceanário");
  await page.getByRole("button", { name: "Add another city" }).click();
  await pick(page, "City 2", "porto", "Porto");
  await pick(page, /Add a spot in Porto/, "majestic", "Café Majestic");
}

test.beforeEach(async ({ page }) => {
  await stubPlaceSearch(page);
});

test("plans a two-city trip into a day-by-day itinerary", async ({ page }) => {
  await buildTrip(page);

  // Categories and default durations are guessed from the place type.
  await expect(page.getByLabel("Category of Oceanário de Lisboa")).toHaveValue("adventure");
  await expect(page.getByLabel("Time to spend at Café Majestic")).toHaveValue("60");

  await page.getByRole("button", { name: "Plan my trip" }).click();

  await expect(page.getByRole("button", { name: /^Day \d+ / })).toHaveCount(4);
  await expect(page.getByText("Tower of Belém").last()).toBeVisible();
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
  await expect(page.getByText(/estimates from straight-line distance/)).toBeVisible();

  // Selecting a day highlights it.
  const firstDay = page.getByRole("button", { name: /^Day 1 Lisbon/ });
  await firstDay.click();
  await expect(firstDay).toHaveAttribute("aria-pressed", "true");
});

test("keeps the trip after a reload and flags stale plans", async ({ page }) => {
  await buildTrip(page);
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-plan trip" })).toBeVisible();

  await page.getByRole("button", { name: "Remove Café Majestic" }).click();
  await expect(page.getByText(/changed the trip since this plan was made/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan my trip" })).toBeDisabled();
  await expect(page.getByText("Add at least one spot in Porto.")).toBeVisible();
});

test("warns when the spots do not fit in the dates", async ({ page }) => {
  await buildTrip(page);
  await page.getByLabel("End date").fill(await page.getByLabel("Start date").inputValue());
  await page.getByRole("button", { name: "Plan my trip" }).click();

  await expect(page.getByText(/need \d+ days but the trip has 1/)).toBeVisible();
  await expect(page.getByText("Extra day").first()).toBeVisible();
});
