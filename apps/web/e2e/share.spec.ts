import { expect, test, type Page } from "@playwright/test";
import { buildTrip, stubPlaceSearch } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubPlaceSearch(page);
});

async function shareLink(page: Page) {
  await page.getByRole("button", { name: "Share trip" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this trip" });
  await expect(dialog.getByLabel("Link")).toHaveValue(/#trip=1\./);
  const url = await dialog.getByLabel("Link").inputValue();
  return { dialog, url };
}

async function planTrip(page: Page, name: string) {
  await buildTrip(page);
  await page.getByLabel("Trip name").fill(name);
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page.getByText(/Travel to Porto/)).toBeVisible();
}

test("a share link opens the same planned trip in another browser", async ({ page, browser }) => {
  await planTrip(page, "Portugal with Sam");
  const { dialog, url } = await shareLink(page);
  await expect(dialog.getByText(/with its day-by-day plan/)).toBeVisible();

  // A fresh context has no storage, like a friend's browser.
  const friend = await browser.newContext();
  const theirs = await friend.newPage();
  await theirs.goto(url);
  await expect(theirs.getByLabel("Trip name")).toHaveValue("Portugal with Sam");
  await expect(theirs.getByText(/Travel to Porto/)).toBeVisible();
  await expect(theirs.getByRole("button", { name: "Re-plan trip" })).toBeVisible();
  await expect(theirs.getByText("Shared with you, not saved")).toBeVisible();
  // The link is cleared from the address bar so a refresh keeps their edits.
  expect(new URL(theirs.url()).hash).toBe("");

  await theirs.getByRole("button", { name: "Save trip" }).click();
  await expect(theirs.getByText("Saved to My trips")).toBeVisible();
  await friend.close();
});

test("a trip whose plan is out of date is shared without the plan", async ({ page, browser }) => {
  await planTrip(page, "Portugal");
  await page.getByRole("button", { name: "Remove Café Majestic" }).click();
  const { dialog, url } = await shareLink(page);
  await expect(dialog.getByText("The plan is out of date, so it is not included.", { exact: false })).toBeVisible();

  const friend = await browser.newContext();
  const theirs = await friend.newPage();
  await theirs.goto(url);
  await expect(theirs.getByLabel("Trip name")).toHaveValue("Portugal");
  await expect(theirs.getByRole("button", { name: "Plan my trip" })).toBeVisible();
  await expect(theirs.getByText(/Travel to Porto/)).toHaveCount(0);
  await friend.close();
});

test("a cut-off share link explains what went wrong", async ({ page }) => {
  await planTrip(page, "Portugal");
  const { url } = await shareLink(page);

  const friend = await page.context().browser()!.newContext();
  const theirs = await friend.newPage();
  await theirs.goto(url.slice(0, -40));
  const alert = theirs.getByRole("alert").filter({ hasText: "share link" });
  await expect(alert).toContainText("This share link is incomplete. It may have been cut off when it was copied.");
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toBeHidden();
  await expect(theirs.getByRole("combobox", { name: "City 1" })).toBeVisible();
  await friend.close();
});

test("opening a share link asks before replacing unsaved work", async ({ page }) => {
  await planTrip(page, "From a friend");
  const { dialog, url } = await shareLink(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("Trip name").fill("My own draft");

  // Same tab, only the fragment changes: the app picks it up without a reload.
  await page.goto(url);
  const prompt = page.getByRole("dialog", { name: "Keep your current trip?" });
  await prompt.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Trip name")).toHaveValue("My own draft");

  await page.goto(url);
  await prompt.getByRole("button", { name: "Discard it" }).click();
  await expect(page.getByLabel("Trip name")).toHaveValue("From a friend");
  await expect(page.getByText("Shared with you, not saved")).toBeVisible();
});
