// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Push/Pull": thickness is locked to the stock. At the default view the middle
// of the bookcase falls on the Back's broad face (see viewport.spec.ts), which is a thickness face.
// The drag and typed-distance paths are covered by the tool's component tests, because no end or
// edge sits under a fixed pixel reliably enough for a browser test.

import { expect, test } from "@playwright/test";

test("Push/Pull on a board's broad face says the thickness is the stock's", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.keyboard.press("p");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("status")).toContainText(
    "A board's thickness is set by its stock. Pick an end or an edge.",
  );
});
