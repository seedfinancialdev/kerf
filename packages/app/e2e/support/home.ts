// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a spec reads and does on Home (design spec §2): the project cards under Recent files, and
// "Open file…" in the sidebar.

import type { Locator, Page } from "@playwright/test";

/**
 * The project cards under Recent files on the bench, newest first. The sidebar has a Recent files
 * list of its own, so the bench's is found inside the main area.
 */
export function projectCards(page: Page): Locator {
  return page.getByRole("main").getByRole("region", { name: "Recent files" }).getByRole("listitem");
}

/** The card of the project named `name`, found by the button that opens it. */
export function projectCard(page: Page, name: string): Locator {
  return projectCards(page).filter({
    has: page.getByRole("button", { name: new RegExp(`^${name} Edited`) }),
  });
}

/** Opens the project named `name` from its card. */
export async function openCard(page: Page, name: string): Promise<void> {
  await projectCard(page, name)
    .getByRole("button", { name: new RegExp(`^${name} Edited`) })
    .click();
}

/** Picks `file` in the chooser that Home's "Open file…" opens. */
export async function openFromHome(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open file…" }).click();
  await (await chooser).setFiles(file);
}
