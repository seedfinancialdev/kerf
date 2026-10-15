// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Who it's for": "the type-anywhere Measurements box work[s] the same" as
// SketchUp. Once a tool waits for a size, typing goes to Measurements without a click into it.
// Push/Pull has no end or edge under a fixed pixel at the default view (tools-push-pull.spec.ts),
// so the Board tool's floor click, which is reliable, starts the wait (as tools-board.spec.ts).

import { expect, test } from "@playwright/test";
import { startPlainCase } from "./support/start";

test("a size typed without clicking into Measurements draws the board", async ({ page }) => {
  await startPlainCase(page);
  await page.getByRole("tab", { name: "Cut list" }).click();
  const model = page.getByRole("region", { name: "Model" });
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
  // The keyboard is the window's again: a tool letter picks the tool and Ctrl+Z undoes the board.
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Move M" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("cutlist-line").filter({ hasText: '24" × 6"' })).toHaveCount(0);
});
