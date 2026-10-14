// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Tape: Measure, add guide lines": two clicks on the model give a reading.

import { expect, test } from "@playwright/test";

test("two clicks on the model show what was measured", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.keyboard.press("t");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(page.getByText("Measured")).toBeVisible();
  // The exact reading depends on the camera; two points 20% of the view apart are not 0" apart.
  const straight = page.locator("dt", { hasText: "Straight line" }).locator("+ dd");
  await expect(straight).toHaveText(/\d/);
  await expect(straight).not.toHaveText('0"');
});
