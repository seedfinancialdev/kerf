// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Join": click two parts; a joint is proposed, or the reason it cannot be, and
// nothing changes until it is accepted. Which boards the pointer hits depends on the view, so the
// numbers live in the unit tests; this checks the flow end to end.

import { expect, test } from "@playwright/test";

test("two clicks with Join give a proposal or a reason, and change nothing until accepted", async ({
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
  await expect(
    page.getByRole("button", { name: "Accept", exact: true }).or(page.getByRole("note")),
  ).toBeVisible();
  await expect(page.getByRole("listbox", { name: "History" }).getByRole("option")).toHaveCount(1);
});
