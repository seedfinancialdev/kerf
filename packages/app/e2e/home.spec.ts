// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, Home: the projects kept in the browser as cards, newest first, each with its
// picture and a menu (rename, duplicate, download, delete with Undo); Open file; the browser's Back
// and Forward between Home and the Workshop; the project older Kerf kept moved in once (ADR 016,
// D5); and a browser that keeps no projects, which Home says.

import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";
import { openCard, openFromHome, projectCard, projectCards } from "./support/home";
import m4 from "./support/m4-storage.json" with { type: "json" };
import { modelDrawn, startBookcase } from "./support/start";

/** Makes a Bookcase, then a Box, each from New project, and goes back Home. */
async function bookcaseThenBox(page: Page): Promise<void> {
  await startBookcase(page);
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  const panel = page.getByRole("dialog", { name: "New project" });
  await panel.getByRole("button", { name: "Box" }).click();
  await panel.getByRole("button", { name: "Create" }).click();
  await modelDrawn(page);
  await page.getByRole("button", { name: "Home" }).click();
}

/** Opens the menu of the card of `name` and chooses `item`. */
async function fromCardMenu(page: Page, name: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("two projects are listed under Recent files with their pictures, the newest first", async ({
  page,
}) => {
  await bookcaseThenBox(page);
  const cards = projectCards(page);
  await expect(cards).toHaveCount(2);
  // The Box was made last, so it was changed last; each card shows the picture taken of its model
  // as the Workshop was left.
  await expect(cards.nth(0)).toContainText("Box");
  await expect(cards.nth(1)).toContainText("Bookcase");
  await expect(cards.nth(0).locator("img")).toBeVisible();
  await expect(cards.nth(1).locator("img")).toBeVisible();
});

test("the card menu renames, duplicates, and deletes with Undo", async ({ page }) => {
  await startBookcase(page);
  await page.getByRole("button", { name: "Home" }).click();

  await fromCardMenu(page, "Bookcase", "Rename");
  await page.getByRole("textbox", { name: "Name" }).fill("Hall bookcase");
  await page.getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(projectCard(page, "Hall bookcase")).toBeVisible();
  await expect(projectCards(page)).toHaveCount(1);

  await fromCardMenu(page, "Hall bookcase", "Duplicate");
  await expect(projectCard(page, "Hall bookcase copy")).toBeVisible();
  await expect(projectCards(page)).toHaveCount(2);

  await fromCardMenu(page, "Hall bookcase copy", "Delete");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(projectCards(page)).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText('Deleted "Hall bookcase copy".');
  await page.getByRole("button", { name: "Undo this" }).click();
  await expect(projectCard(page, "Hall bookcase copy")).toBeVisible();
  await expect(projectCards(page)).toHaveCount(2);
});

test("a downloaded .kerf file opened from Home is added as a third project", async ({ page }) => {
  await bookcaseThenBox(page);
  const download = page.waitForEvent("download");
  await fromCardMenu(page, "Bookcase", "Download .kerf file");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Bookcase.kerf");
  await openFromHome(page, {
    name: file.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(await file.path()),
  });
  await expect(page.getByRole("option", { name: "Opened Bookcase.kerf" })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(projectCards(page)).toHaveCount(3);
});

test("the browser's Back goes Home from the Workshop, and Forward goes back to it", async ({
  page,
}) => {
  await startBookcase(page);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "What's on the bench?" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("navigation", { name: "Workflow" })).toBeVisible();
  await modelDrawn(page);
});

test.describe("after upgrading from M4", () => {
  // What the merged M4 build kept in browser storage, captured from it and frozen
  // (support/m4-storage.json says how): one project (`kerf.project`: the golden bookcase's design,
  // packages/fixtures/bookcase/structure.json, built in M4 with its own ids) and the shop as a
  // version-1 ShopProfile, with a 3/4" dado stack and a 3/32" blade.
  test.use({
    storageState: {
      cookies: [],
      origins: [{ origin: "http://localhost:5173", localStorage: m4.localStorage }],
    },
  });

  test("the kept bookcase is one card on Home, with the same cut list, once", async ({ page }) => {
    await page.goto("/");
    await expect(projectCards(page)).toHaveCount(1);
    await openCard(page, "Bookcase");
    await modelDrawn(page);
    // M4 never showed the tour, so this first Workshop visit offers it.
    await page.getByRole("button", { name: "Skip tour" }).click();
    await page.getByRole("tab", { name: "Cut list" }).click();
    // The golden bookcase's cut list (packages/fixtures/bookcase/expected/cutlist.json): sides
    // 72", top, bottom and shelves 35-1/16", back 35-5/16" wide.
    const lines = page.getByTestId("cutlist-line");
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('72"');
    await expect(lines.nth(1)).toContainText('35-1/16"');
    await expect(lines.nth(2)).toContainText('35-5/16"');
    // Moved, not copied: storage no longer holds it, so a reload cannot move it in again.
    expect(await page.evaluate(() => localStorage.getItem("kerf.project"))).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: "What's on the bench?" })).toBeVisible();
    await expect(projectCards(page)).toHaveCount(1);
  });

  test("the M4 shop is carried over: Kerf asks nothing about it and keeps its blade", async ({
    page,
  }) => {
    // A shop M4 kept is a set-up pegboard (ADR 016, D3), so Home opens, not Your shop.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What's on the bench?" })).toBeVisible();
    await openCard(page, "Bookcase");
    await modelDrawn(page);
    await page.getByRole("button", { name: "Skip tour" }).click();
    // M4's dado stack (3/4") cuts the 23/32" shelf dados, so Joinery says so and asks nothing.
    await page.getByRole("button", { name: "Joinery" }).click();
    await expect(page.getByText("Your dado stack cuts this.").first()).toBeVisible();
    await expect(page.getByText("Do you have one?")).toHaveCount(0);
    // And the pegboard hangs M4's table saw with its own thin-kerf blade: 3/32" = 19,050.
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const tableSaw = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: /^Table saw/ }) });
    await expect(tableSaw.getByLabel("Blade")).toHaveValue("19050");
  });
});

test("a browser with no database says Home cannot keep projects, and a new one still opens", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as { indexedDB?: IDBFactory }).indexedDB;
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText(
    "This browser isn't keeping your projects. Download a .kerf file to keep your work.",
  );
  await page.getByRole("button", { name: "New project" }).click();
  const panel = page.getByRole("dialog", { name: "New project" });
  await panel.getByRole("button", { name: "Bookcase" }).click();
  await panel.getByRole("button", { name: "Create" }).click();
  await modelDrawn(page);
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
});
