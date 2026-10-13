// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Board": draw a board from stock on the floor with typed sizes; it joins the
// cut list.

import { expect, test } from "@playwright/test";

test("draws a 24 x 6 board on the floor and it joins the cut list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Blank case" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  const before = await page.getByTestId("cutlist-line").count();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.keyboard.press("b");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  // The bottom of the model area is floor in front of the case at the default view.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.getByLabel("Measurements").fill('24", 6"');
  await page.getByLabel("Measurements").press("Enter");
  await expect(page.getByRole("option", { name: "Added Board 1" })).toBeVisible();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(before + 1);
});
