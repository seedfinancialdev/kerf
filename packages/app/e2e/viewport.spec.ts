// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Viewport (center): … click a part to see its joints". At the default view the
// middle of the bookcase falls between shelves 2 and 3 (gap 29-15/64" to 42-25/32"), so the first
// board under the centre is the back (hand calculation in the plan, Task 24).

import { expect, test } from "@playwright/test";

test("clicking the middle of the bookcase selects the back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("heading", { name: "Back" })).toBeVisible({ timeout: 10_000 });
});
