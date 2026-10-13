// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Who it's for": "the type-anywhere Measurements box work[s] the same" as
// SketchUp. Once a tool waits for a size, typing goes to Measurements without a click into it.
// Push/Pull has no end or edge under a fixed pixel at the default view (tools-push-pull.spec.ts),
// so the Board tool's floor click, which is reliable, starts the wait (as tools-board.spec.ts).

import { expect, test } from "@playwright/test";

test("a size typed without clicking into Measurements draws the board", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Blank case" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.keyboard.press("b");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  // The bottom of the model area is floor in front of the case at the default view.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.keyboard.type('24", 6"');
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Added Board 1" })).toBeVisible();
  // The board is the size typed: 24" long and 6" wide.
  await expect(page.getByTestId("cutlist-line").filter({ hasText: '24" × 6"' })).toHaveCount(1);
});
