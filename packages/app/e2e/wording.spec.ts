// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// CLAUDE.md: banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude,
// boolean. Checked on every step, every plan tab and every tool panel of the core flow, the New
// chooser, the Settings menu, a Join answer and a notice, in the words shown and in the
// placeholders, tooltips and labels a screen reader announces.

import { expect, type Page, test } from "@playwright/test";
import { bannedWordsIn } from "../src/testing/banned-words";
import { TOOLS } from "../src/tools/tools";

/**
 * The words on screen, with every placeholder, tooltip and accessible label (UI text too, though
 * not visible as text); empty text means the screen was not read, so it fails rather than passes.
 */
async function shown(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  expect(text.trim()).not.toBe("");
  const attributes = await page.evaluate(() =>
    [...document.querySelectorAll("[placeholder],[title],[aria-label]")].flatMap((e) =>
      ["placeholder", "title", "aria-label"].flatMap((a) => e.getAttribute(a) ?? []),
    ),
  );
  return [text, ...attributes].join("\n");
}

test("no screen of the core flow shows a banned word", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("button", { name: "Bookcase" })).toBeVisible();
  const seen: string[] = [await shown(page)];
  await page.getByRole("button", { name: "Bookcase" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  seen.push(await shown(page));
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Millimetres")).toBeVisible();
  seen.push(await shown(page));
  await page.keyboard.press("Escape");
  // A Join answer: at the default view the two clicks land on the back and a shelf of the row
  // (as in tools-join.spec.ts), and Join says why it offers no joint.
  await page.getByRole("button", { name: "Shape" }).click();
  await page.keyboard.press("j");
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await expect(page.getByText(/won't cut a joint into it/)).toBeVisible();
  seen.push(await shown(page));
  // A notice: moving the top takes it over from the form, which the notice line says with Undo.
  await page.getByTestId("part-group-tops").click();
  await page.keyboard.press("m");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowUp");
  await page.getByLabel("Measurements").fill('2"');
  await page.getByLabel("Measurements").press("Enter");
  await expect(page.getByRole("button", { name: "Undo this" })).toBeVisible();
  seen.push(await shown(page));
  for (const step of ["Shape", "Divide", "Joinery", "Build plan"]) {
    await page.getByRole("button", { name: step }).click();
    for (const tab of ["Shopping", "Cut list", "Sheets", "Setups", "Assembly"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      seen.push(await shown(page));
    }
  }
  await page.getByTestId("part-group-shelves").click();
  seen.push(await shown(page));
  for (const tool of TOOLS.filter((t) => t.id !== "select")) {
    await page.keyboard.press(tool.key.toLowerCase());
    await expect(
      page.getByRole("button", { name: new RegExp(`^${tool.label}\\b`), pressed: true }),
    ).toBeVisible();
    seen.push(await shown(page));
  }
  expect(bannedWordsIn(seen.join("\n"))).toEqual([]);
});
