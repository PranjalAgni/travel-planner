import { expect, test, type Page } from "@playwright/test";
import { buildTrip, stubPlaceSearch } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubPlaceSearch(page);
});

async function openLibrary(page: Page) {
  await page.getByRole("button", { name: /My trips/ }).click();
  return page.getByRole("dialog", { name: "My trips" });
}

async function planAndSave(page: Page, name: string) {
  await buildTrip(page);
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
  await page.getByLabel("Trip name").fill(name);
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByText("Saved to My trips")).toBeVisible();
}

test("saves a planned trip and reopens it from My trips", async ({ page }) => {
  await planAndSave(page, "Portugal spring");

  await page.getByRole("button", { name: "New trip" }).click();
  await expect(page.getByRole("combobox", { name: "City 1" })).toBeVisible();
  await expect(page.getByText(/Travel to Porto/)).toHaveCount(0);

  // The library survives a reload, and the reopened trip comes back with its plan.
  await page.reload();
  const library = await openLibrary(page);
  await expect(library.getByText("Lisbon → Porto · 3 spots")).toBeVisible();
  await library.getByRole("button", { name: /^Portugal spring/ }).click();
  await expect(library).toBeHidden();
  await expect(page.getByLabel("Trip name")).toHaveValue("Portugal spring");
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-plan trip" })).toBeVisible();
});

test("saved trips keep later edits, and a deleted trip stays open unsaved", async ({ page }) => {
  await buildTrip(page);
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByText("Saved to My trips")).toBeVisible();

  await page.getByRole("button", { name: "Remove Café Majestic" }).click();
  await page.getByLabel("Trip name").fill("Edited name");

  const library = await openLibrary(page);
  await expect(library.getByRole("button", { name: /^Edited name Open/ })).toBeVisible();
  await expect(library.getByText("Lisbon → Porto · 2 spots")).toBeVisible();

  await library.getByRole("button", { name: "Delete Edited name" }).click();
  await page.getByRole("dialog", { name: "Delete trip?" }).getByRole("button", { name: "Delete" }).click();
  await expect(library.getByText("No saved trips yet")).toBeVisible();
  await library.getByRole("button", { name: "Close" }).click();

  await expect(page.getByText("Not saved yet")).toBeVisible();
  await expect(page.getByLabel("Trip name")).toHaveValue("Edited name");
});

test("asks before discarding an unsaved trip", async ({ page }) => {
  await buildTrip(page);
  const prompt = page.getByRole("dialog", { name: "Keep your current trip?" });

  await page.getByRole("button", { name: "New trip" }).click();
  await prompt.getByRole("button", { name: "Cancel" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("combobox", { name: /Add a spot in Porto/ })).toBeVisible();

  await page.getByRole("button", { name: "New trip" }).click();
  await prompt.getByRole("button", { name: "Save it first" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("combobox", { name: "City 1" })).toBeVisible();

  const library = await openLibrary(page);
  await expect(library.getByRole("button", { name: /^Lisbon & Porto, / })).toBeVisible();
});

test("exports a trip to a file and imports it back", async ({ page }, testInfo) => {
  await planAndSave(page, "Portugal");
  const library = await openLibrary(page);

  const downloading = page.waitForEvent("download");
  await library.getByRole("button", { name: "Export Portugal" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("portugal.trip.json");
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);

  const picker = library.getByLabel("Trip files to import");
  await picker.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(library.getByText("notes.json is not a trip file from this app.")).toBeVisible();

  // An import never overwrites: a clashing name gets a suffix.
  await picker.setInputFiles(file);
  await expect(library.getByText('Imported "Portugal (2)".')).toBeVisible();

  await library.getByRole("button", { name: /^Portugal \(2\)/ }).click();
  await expect(page.getByLabel("Trip name")).toHaveValue("Portugal (2)");
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-plan trip" })).toBeVisible();
});
