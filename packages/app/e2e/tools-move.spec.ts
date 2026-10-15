// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Move / copy": M moves with axis locks and typed distances; the arrow keys lock
// the direction (up is the vertical one).

import { expect, type Page, test } from "@playwright/test";
import { startBookcase } from "./support/start";

/**
 * The project the app keeps in the browser's library after each recorded change (its saved
 * intent): the only project in IndexedDB "kerf", store "projects" (library.ts, schema version 1).
 * The write lands a moment after the change shows, so callers poll.
 */
async function keptProject(page: Page): Promise<{
  instances: { name?: string; position: { z: string } }[];
  parts: { name: string; detached?: boolean }[];
}> {
  const texts = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open("kerf");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const rows = db.transaction("projects").objectStore("projects").getAll();
          rows.onerror = () => reject(rows.error);
          rows.onsuccess = () => {
            db.close();
            resolve(rows.result.map((row: { project: string }) => row.project));
          };
        };
      }),
  );
  const [text] = texts;
  if (texts.length !== 1 || text === undefined) {
    throw new Error(`expected one kept project, found ${texts.length}`);
  }
  return JSON.parse(text);
}

test("moves the top by a typed distance and undoes it", async ({ page }) => {
  await startBookcase(page);
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
  await startBookcase(page);
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
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
  await expect
    .poll(
      async () =>
        (await keptProject(page)).instances.find((i) => /^Shelf copy \d+$/.test(i.name ?? ""))
          ?.position.z,
    )
    .toMatch(/\) \+ \S/);
});
