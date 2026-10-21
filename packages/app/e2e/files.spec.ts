// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving" and §2 (Home): the project menu's "Download .kerf file" writes a .kerf;
// Home's "Open file…" adds one as a project and opens it; a damaged file is refused and the
// projects already kept are kept.

import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { openCard, openFromHome, projectCards } from "./support/home";
import { modelDrawn, startBookcase } from "./support/start";

test("downloads the bookcase and opens it again", async ({ page }) => {
  // The download takes the view's picture for the thumbnail; startBookcase waits until it is drawn.
  await startBookcase(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("menuitem", { name: "Download .kerf file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Bookcase.kerf");
  await page.getByRole("button", { name: "Home" }).click();
  // Playwright saves the download under a temporary name, so the file is offered under its own.
  await openFromHome(page, {
    name: file.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(await file.path()),
  });
  await expect(page.getByRole("option", { name: "Opened Bookcase.kerf" })).toBeVisible();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
});

test("refuses a damaged file and keeps the project", async ({ page }) => {
  await startBookcase(page);
  await page.getByRole("button", { name: "Home" }).click();
  await openFromHome(page, {
    name: "broken.kerf",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip"),
  });
  await expect(page.getByRole("status")).toContainText("This file could not be opened");
  // Nothing was added: the bookcase is still the only project, and it opens as it was.
  await expect(projectCards(page)).toHaveCount(1);
  await openCard(page, "Bookcase");
  await modelDrawn(page);
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
});
