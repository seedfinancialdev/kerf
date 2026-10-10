// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Core flow: the bookcase in 6 steps" and the resize to 30".
// This is the build's end-to-end acceptance test (M4). It is written first and fails on purpose:
// Playwright's test.fail() keeps CI green while the app does not exist, and turns red the moment
// the test passes while milestones.json still says M4 is inactive.
//
// The names below (button labels, field labels, test ids) are the contract the M4 app must meet.
// Visible text is shop language from the Interaction spec.

import { isMilestoneActive } from "@kerf/fixtures";
import { expect, test } from "@playwright/test";

test('bookcase in 6 steps, then resize to 30"', async ({ page }) => {
  test.fail(!isMilestoneActive("M4"), "M4: the app and 3D view are not built yet");

  await page.goto("/");

  // 1. New → Bookcase template. Overall size 36" × 72" × 12".
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByLabel("Width").fill('36"');
  await page.getByLabel("Height").fill('72"');
  await page.getByLabel("Depth").fill('12"');

  // 2. Shape: carcase 3/4" plywood, top and bottom between the sides, back inset in rabbets, 1/4" plywood.
  await page.getByRole("button", { name: "Shape" }).click();
  await page.getByLabel("Carcase stock").selectOption("3/4 plywood");
  await page.getByLabel("Top and bottom").selectOption("Between the sides");
  await page.getByLabel("Back").selectOption("Inset in rabbets");
  await page.getByLabel("Back stock").selectOption("1/4 plywood");

  // 3. Divide: click the opening → Add shelves → 4, evenly spaced.
  await page.getByRole("button", { name: "Divide" }).click();
  await page.getByTestId("opening").first().click();
  await page.getByRole("button", { name: "Add shelves" }).click();
  await page.getByLabel("Count").fill("4");
  await page.getByLabel("Spacing").selectOption("Evenly spaced");

  // 4. Joinery: the shop profile has a dado stack, so dados and rabbets are proposed. Accept all.
  await page.getByRole("button", { name: "Joinery" }).click();
  await page.getByRole("button", { name: "Accept all" }).click();

  // 5. Edge: select the shelves → 1/8" roundover on both front edges.
  await page.getByTestId("part-group-shelves").click();
  await page.getByRole("button", { name: "Edge profile" }).click();
  await page.getByLabel("Radius").selectOption('1/8"');
  await page.getByRole("button", { name: "Both front edges" }).click();

  // 6. Build plan: 3 cut list lines, 3 sheets, 3 setups and the assembly order.
  await page.getByRole("button", { name: "Build plan" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
  await page.getByRole("tab", { name: "Sheets" }).click();
  await expect(page.getByTestId("sheet")).toHaveCount(3);
  await page.getByRole("tab", { name: "Setups" }).click();
  await expect(page.getByTestId("setup")).toHaveCount(3);
  await page.getByRole("tab", { name: "Assembly" }).click();
  await expect(page.getByTestId("assembly-step")).not.toHaveCount(0);

  // Then change the width to 30": every part, joint and output updates.
  await page.getByRole("button", { name: "Shape" }).click();
  await page.getByLabel("Width").fill('30"');
  await page.getByRole("button", { name: "Build plan" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('29-1/16"');
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('28-9/16"');
  await page.getByRole("tab", { name: "Setups" }).click();
  await expect(page.getByTestId("setup").first()).toContainText('1/4" deep');
});

test("exports the build plan as a PDF", async ({ page }) => {
  test.fail(!isMilestoneActive("M5"), "M5: the build plan PDF is not built yet");

  await page.goto("/");
  await page.getByRole("button", { name: "Build plan" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});
