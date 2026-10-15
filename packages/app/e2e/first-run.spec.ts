// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §1 (Your shop), "Ask when it matters" and §4 (the tour), as a first visit meets
// them: the pegboard first, then Home; a skipped pegboard asked about a tool once, when a joint
// needs it; and the tour on the first Workshop visit only.

import { expect, type Page, test } from "@playwright/test";
import { openCard } from "./support/home";
import { modelDrawn, startBookcase } from "./support/start";

// A first visit: nothing in browser storage (the config seeds a returning user for every other spec).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Asked in Joinery about the dado stack (tool-questions.ts; the design spec's example words are
 * "This joint needs a dado stack. Do you have one?").
 */
const DADO_QUESTION = "Dados, grooves and rabbets need a dado stack. Do you have one?";

const home = (page: Page) => page.getByRole("heading", { name: "What's on the bench?" });

test("the first visit hangs up the tools, then shows Home, and Home again after a reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hang up your tools." })).toBeVisible();
  const trackSaw = page.getByRole("button", { name: /^Track saw/ });
  await trackSaw.click();
  await expect(trackSaw).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "That's my shop" }).click();
  await expect(home(page)).toBeVisible();
  await page.reload();
  await expect(home(page)).toBeVisible();
});

test("a skipped shop is asked about the dado stack once, and the answer is kept", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(home(page)).toBeVisible();
  await startBookcase(page);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.getByRole("button", { name: "Joinery" }).click();
  // Asked once, on the first joint that needs the tool, however many joints do.
  await expect(page.getByText(DADO_QUESTION)).toHaveCount(1);
  await page.getByRole("button", { name: "Yes, I have one" }).click();
  await expect(page.getByText(DADO_QUESTION)).toHaveCount(0);
  // The dados stay, cut with the dado stack the answer hung.
  await expect(page.getByText("Your dado stack cuts this.").first()).toBeVisible();

  await page.reload();
  await openCard(page, "Bookcase");
  await modelDrawn(page);
  await page.getByRole("button", { name: "Joinery" }).click();
  await expect(page.getByText("Your dado stack cuts this.").first()).toBeVisible();
  await expect(page.getByText(DADO_QUESTION)).toHaveCount(0);
});

test("the tour shows on the first project, and not after it is skipped", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "That's my shop" }).click();
  await startBookcase(page);
  const tour = page.getByRole("dialog", { name: /^Tour/ });
  await expect(tour).toHaveAccessibleName("Tour, step 1 of 4");
  await expect(tour).toContainText("These four steps take your piece from shape to cut list.");
  await tour.getByRole("button", { name: "Skip tour" }).click();
  await expect(tour).toHaveCount(0);

  await page.reload();
  await openCard(page, "Bookcase");
  await modelDrawn(page);
  // The tour shows with the Workshop, before the model's first picture, so by now it would be up.
  await expect(tour).toHaveCount(0);
});
