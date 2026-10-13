// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// CLAUDE.md: banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude,
// boolean. Checked on every step, every plan tab and every tool panel of the core flow.

import { expect, type Page, test } from "@playwright/test";
import { bannedWordsIn } from "./support/banned-words";

const TOOL_NAMES: Record<string, string> = {
  b: "Board",
  p: "Push/Pull",
  m: "Move",
  j: "Join",
  f: "Edge profile",
  t: "Tape",
};

/** The text on screen; empty text means the screen was not read, so it fails rather than passes. */
async function shown(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  expect(text.trim()).not.toBe("");
  return text;
}

test("no screen of the core flow shows a banned word", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  const seen: string[] = [await shown(page)];
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
  for (const key of ["b", "p", "m", "j", "f", "t"]) {
    await page.keyboard.press(key);
    await expect(
      page.getByRole("button", { name: new RegExp(`^${TOOL_NAMES[key]}\\b`), pressed: true }),
    ).toBeVisible();
    seen.push(await shown(page));
  }
  expect(bannedWordsIn(seen.join("\n"))).toEqual([]);
});
