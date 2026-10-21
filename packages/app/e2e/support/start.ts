// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// How a spec reaches the Workshop (design spec §2 and §3): from Home, New project, a piece, then
// Create. The model is waited for, because a click on it lands on nothing until its first picture
// is drawn (INTEGRATION_TEST_STANDARD §6: wait for readiness, never sleep).

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Waits until the model area is on screen and has drawn its first picture. The canvas is waited
 * for first: before the Workshop shows, "Drawing the model…" is not there either.
 */
export async function modelDrawn(page: Page): Promise<void> {
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
}

/** Opens New project from Home and returns the panel. */
export async function openNewProject(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  return page.getByRole("dialog", { name: "New project" });
}

/**
 * Starts the Bookcase template at the panel's usual size (36" × 72" × 12", four shelves, 3/4
 * plywood) and waits for the model.
 */
export async function startBookcase(page: Page): Promise<void> {
  const panel = await openNewProject(page);
  await panel.getByRole("button", { name: "Bookcase" }).click();
  await panel.getByRole("button", { name: "Create" }).click();
  await modelDrawn(page);
}

/**
 * Starts a Plain case (the Blank tab) at 30" × 36" × 12", the size of M4's Blank case that the
 * specs using it were written against, and waits for the model.
 */
export async function startPlainCase(page: Page): Promise<void> {
  const panel = await openNewProject(page);
  await panel.getByRole("tab", { name: "Blank" }).click();
  await panel.getByRole("button", { name: "Plain case" }).click();
  await panel.getByLabel("Width").fill('30"');
  await panel.getByLabel("Height").fill('36"');
  await panel.getByLabel("Depth").fill('12"');
  await panel.getByRole("button", { name: "Create" }).click();
  await modelDrawn(page);
}
