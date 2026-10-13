// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Neutral chrome": a light theme as a setting. Domain model, units: metric as a
// setting. ADR 015, rule 4: millimetres apply to projects started afterwards.

import { expect, test } from "@playwright/test";

test("the light theme gives a light background", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Light").check();
  const [r, g, b] = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)?.map(Number) ?? [0, 0, 0]);
  expect(Math.min(r ?? 0, g ?? 0, b ?? 0)).toBeGreaterThan(200);
});

test("millimetres show in the cut list of a project started afterwards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Millimetres").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  // 72" = 1828.8 mm (Domain model: 1 mm = 8000 units, 1" = 203200 = 25.4 mm).
  await expect(page.getByTestId("cutlist-line").first()).toContainText("1828.8 mm");
});
