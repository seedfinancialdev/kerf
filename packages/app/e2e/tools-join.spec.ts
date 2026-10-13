// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Join": click two parts; a joint is proposed, or the reason it cannot be, and
// nothing changes until it is accepted. Which boards the pointer hits depends on the camera, so the
// unit tests hold the numbers; this checks the flow end to end at the default view.

import { expect, test } from "@playwright/test";

test("two clicks with Join propose a dado for a shelf of a row, and change nothing until accepted", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.keyboard.press("j");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  // At the default camera the first click lands on the back and the second on the second shelf, a
  // board of a row; the engine proposes a dado with the shelf taken out of its row first.
  await expect(
    page.getByText('Shelf copy 2 in a dado in Back, 23/32" wide and 5/64" deep'),
  ).toBeVisible();
  await expect(page.getByText("Accepting makes Shelf 2 and Back custom.")).toBeVisible();
  const history = page.getByRole("listbox", { name: "History" }).getByRole("option");
  await expect(history).toHaveCount(1);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(history).toHaveCount(2);
  await expect(
    page.getByRole("option", { name: "Joined Shelf copy 2 to Back with a dado" }),
  ).toBeVisible();
});
