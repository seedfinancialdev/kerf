// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Move / copy": M moves with axis locks and typed distances; the arrow keys lock
// the direction (up is the vertical one).

import { expect, type Page, test } from "@playwright/test";

/** The project the app keeps in browser storage after each recorded change (its saved intent). */
async function keptProject(page: Page): Promise<{
  instances: { name?: string; position: { z: string } }[];
  parts: { name: string; detached?: boolean }[];
}> {
  const text = await page.evaluate(() => localStorage.getItem("kerf.project"));
  if (!text) throw new Error("no project kept");
  return JSON.parse(text);
}

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
  await expect(page.getByRole("option", { name: "New bookcase" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The top is the form's again: nothing is taken over in the project kept after Undo.
  await expect
    .poll(async () => (await keptProject(page)).parts.some((d) => d.detached))
    .toBe(false);
});

test("lifts a shelf by dragging it upward, even past the top of the model", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowUp");
  // At the default view the bottom shelf's top face sits about a quarter of the way down the model.
  const x = box.x + box.width * 0.485;
  await page.mouse.move(x, box.y + box.height * 0.235);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.18, { steps: 5 });
  await page.mouse.move(x, box.y - 30, { steps: 10 });
  await page.mouse.up();
  // A shelf of the row is taken out as a copy of its own and moved.
  await expect(page.getByRole("option", { name: /^Moved Shelf( copy)? \d+ / })).toBeVisible();
  // Up, not down: the moved copy's height is written as its old height plus the distance.
  const moved = (await keptProject(page)).instances.find((i) =>
    /^Shelf copy \d+$/.test(i.name ?? ""),
  );
  expect(moved?.position.z).toMatch(/\) \+ \S/);
});
