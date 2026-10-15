// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// CLAUDE.md: banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude,
// boolean. Checked on every step, every plan tab and every tool panel of the core flow, the Settings
// menu, a Join answer and a notice; on Home, Your shop, every tab of New project, the tour, the
// tool row's tips, and the questions a skipped shop is asked; in the words shown and in the
// placeholders, tooltips and labels a screen reader announces.

import { expect, type Page, test } from "@playwright/test";
import { bannedWordsIn } from "../src/testing/banned-words";
import { TOOLS } from "../src/tools/tools";
import { openNewProject, startBookcase } from "./support/start";

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
  await startBookcase(page);
  const model = page.getByRole("region", { name: "Model" });
  const seen: string[] = [await shown(page)];
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

test("Home, Your shop and every tab of New project show no banned word", async ({ page }) => {
  // A project first, so Home shows a card and its menu as well as the templates.
  await startBookcase(page);
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "What's on the bench?" })).toBeVisible();
  const seen: string[] = [await shown(page)];
  await page.getByRole("button", { name: "More for Bookcase" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  seen.push(await shown(page));
  await page.keyboard.press("Escape");

  // Your shop, with the router's bits open beside its card.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Your shop" }).click();
  await expect(page.getByRole("heading", { name: "Hang up your tools." })).toBeVisible();
  seen.push(await shown(page));
  await page.getByRole("button", { name: "Edit bits" }).click();
  await expect(page.getByRole("dialog", { name: "Router bits" })).toBeVisible();
  seen.push(await shown(page));
  await page
    .getByRole("dialog", { name: "Router bits" })
    .getByRole("button", { name: "Done" })
    .click();
  await page.getByRole("button", { name: "Cancel" }).click();

  // New project: each tab, a piece that comes later, Space to fill, wood of one's own and
  // Something else.
  const panel = await openNewProject(page);
  seen.push(await shown(page));
  // A piece that comes later is marked unavailable but can still be pressed, to say so.
  await panel.getByRole("button", { name: /^Table/ }).click({ force: true });
  await expect(panel.getByText(/Kerf can't build a table yet/)).toBeVisible();
  seen.push(await shown(page));
  await panel.getByRole("button", { name: "Bookcase" }).click();
  await panel.getByRole("button", { name: "Space to fill" }).click();
  await expect(panel.getByLabel("Gap")).toBeVisible();
  seen.push(await shown(page));
  await panel.getByRole("button", { name: "Other…" }).click();
  seen.push(await shown(page));
  await panel.getByRole("button", { name: /^Something else/ }).click();
  await expect(panel.getByLabel("What are you thinking of building?")).toBeVisible();
  seen.push(await shown(page));
  for (const tab of ["Blank", "Open file"]) {
    await panel.getByRole("tab", { name: tab }).click();
    await expect(panel.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    seen.push(await shown(page));
  }
  expect(bannedWordsIn(seen.join("\n"))).toEqual([]);
});

test("the tour and the tool row's tips show no banned word", async ({ page }) => {
  await startBookcase(page);
  const seen: string[] = [];
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog", { name: /^Tour/ });
  for (const step of [1, 2, 3, 4]) {
    await expect(tour).toHaveAccessibleName(`Tour, step ${step} of 4`);
    seen.push(await shown(page));
    await tour.getByRole("button", { name: step < 4 ? "Next" : "Done" }).click();
  }
  await expect(tour).toHaveCount(0);
  // A tip shows after the pointer rests on its button for a moment; waiting for it to show is the
  // wait (no fixed sleep).
  for (const tool of TOOLS) {
    await page.getByRole("button", { name: new RegExp(`^${tool.label}\\b`) }).hover();
    await expect(page.getByRole("tooltip")).toContainText(tool.label);
    seen.push(await shown(page));
  }
  expect(bannedWordsIn(seen.join("\n"))).toEqual([]);
});

test.describe("a skipped shop", () => {
  // A first visit (the config seeds a returning user, whose shop is set up and never asked).
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the pegboard and the questions asked when a tool matters show no banned word", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hang up your tools." })).toBeVisible();
    const seen: string[] = [await shown(page)];
    await page.getByRole("button", { name: "Skip for now" }).click();
    await startBookcase(page);
    // The tour of a first Workshop visit, and the Cut list's saw question beside it (Ruling R24).
    seen.push(await shown(page));
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(
      page.getByText('Your cut list assumes a 1/8" blade. What do you cut with?'),
    ).toBeVisible();
    seen.push(await shown(page));
    await page.getByRole("button", { name: "Joinery" }).click();
    await expect(
      page.getByText("Dados, grooves and rabbets need a dado stack. Do you have one?"),
    ).toBeVisible();
    seen.push(await shown(page));
    expect(bannedWordsIn(seen.join("\n"))).toEqual([]);
  });
});
