import { expect, test } from "@playwright/test";
import { buildTrip, stubPlaceSearch } from "./helpers";

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
