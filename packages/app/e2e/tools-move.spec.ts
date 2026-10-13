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

test("lifts a shelf by dragging it upward, even past the top of the model", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.waitForTimeout(1500); // the 3D view has fitted the bookcase
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowUp");
  // At the default view the bottom shelf's top face sits about a quarter of the way down the model.
  const x = box.x + box.width * 0.485;
  await page.mouse.move(x, box.y + box.height * 0.235);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.18, { steps: 5 });
  await page.mouse.move(x, box.y - 30, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("option", { name: /^Moved / })).toBeVisible();
});
