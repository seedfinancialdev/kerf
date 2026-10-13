// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Move / copy": M moves with axis locks and typed distances; the arrow keys lock
// the direction (up is the vertical one).

import { expect, test } from "@playwright/test";

test("moves the top by a typed distance and undoes it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  await page.getByTestId("part-group-tops").click();
  await page.keyboard.press("m");
  // The tree row still has the keyboard, and the arrows belong to it; hand it back to the window.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowUp");
  await page.getByLabel("Measurements").fill('2"');
  await page.getByLabel("Measurements").press("Enter");
  await expect(page.getByRole("option", { name: 'Moved Top 2"' })).toBeVisible();
  await page.getByRole("region", { name: "Model" }).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("option", { name: 'Moved Top 2"' })).not.toHaveAttribute(
    "aria-selected",
    "true",
  );
});
