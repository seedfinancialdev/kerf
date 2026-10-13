// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": Save writes a .kerf; Open reads one; a damaged file is refused and the
// current project is kept.

import { readFile } from "node:fs/promises";

import { isMilestoneActive } from "@kerf/fixtures";
import { expect, test } from "@playwright/test";

test("saves the bookcase and opens it again", async ({ page }) => {
  test.fail(!isMilestoneActive("M4"), "M4: the app is not built yet");
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Bookcase.kerf");
  // Playwright saves the download under a temporary name, so the file is offered under its own.
  await page.getByLabel("Open a .kerf file").setInputFiles({
    name: file.suggestedFilename(),
    mimeType: "application/zip",
    buffer: await readFile(await file.path()),
  });
  await expect(page.getByRole("option", { name: "Opened Bookcase.kerf" })).toBeVisible();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
});

test("refuses a damaged file and keeps the project", async ({ page }) => {
  test.fail(!isMilestoneActive("M4"), "M4: the app is not built yet");
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByLabel("Open a .kerf file").setInputFiles({
    name: "broken.kerf",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip"),
  });
  await expect(page.getByRole("status")).toContainText("This file could not be opened");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
});
