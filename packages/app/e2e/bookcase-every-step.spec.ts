// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The companion to bookcase.spec.ts. The acceptance test starts from the
// Bookcase template, which already has the choices steps 2 to 5 make, so those clicks change
// nothing and would pass even if broken. This flow builds the same bookcase from the Blank case
// (30" x 36" x 12", no shelves, no depths, no roundover), so each step must do its work, and
// checks that each change reaches History. The outputs are then the spec's: Operation specs,
// "Golden test: bookcase" (3 lines, 3 sheets, 3 setups) and the resize to 30".

import { expect, type Page, test } from "@playwright/test";

/** The History entry a change records; it must appear for the step to have done anything. */
const recorded = (page: Page, label: string) =>
  expect(page.getByRole("listbox", { name: "History" }).getByRole("option", { name: label }));

/** Types a size into a field and commits it with Enter, as a user would. */
async function type(page: Page, label: string, text: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(text);
  await field.press("Enter");
}

test('the bookcase built from the Blank case, every step recorded, then resized to 30"', async ({
  page,
}) => {
  await page.goto("/");

  // 1. New → Blank case, then the spec's size. The Blank case is 30" x 36" x 12", so width and
  //    height change; depth is already 12".
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Blank case" }).click();
  await recorded(page, "New blank case").toBeVisible();
  await type(page, "Width", '36"');
  await recorded(page, 'Width 30" → 36"').toBeVisible();
  await type(page, "Height", '72"');
  await recorded(page, 'Height 36" → 72"').toBeVisible();

  // 2. Shape. The Blank case already has the spec's choices, so each select first takes another
  //    value and then the spec's, and both are recorded: a select that did nothing would not be.
  await page.getByRole("button", { name: "Shape" }).click();
  await page.getByLabel("Carcase stock").selectOption("4/4 walnut");
  await recorded(page, "Carcase stock: 4/4 walnut").toBeVisible();
  await page.getByLabel("Carcase stock").selectOption("3/4 plywood");
  await recorded(page, "Carcase stock: 3/4 plywood").toBeVisible();
  await page.getByLabel("Top and bottom").selectOption("Sides between the top and bottom");
  await recorded(page, "Top and bottom: sides between the top and bottom").toBeVisible();
  await page.getByLabel("Top and bottom").selectOption("Between the sides");
  await recorded(page, "Top and bottom: between the sides").toBeVisible();
  await page.getByLabel("Back", { exact: true }).selectOption("Applied to the back edges");
  await recorded(page, "Back: applied to the back edges").toBeVisible();
  await page.getByLabel("Back", { exact: true }).selectOption("Inset in rabbets");
  await recorded(page, "Back: inset in rabbets").toBeVisible();
  await page.getByLabel("Back stock").selectOption("3/4 plywood");
  await recorded(page, "Back stock: 3/4 plywood").toBeVisible();
  await page.getByLabel("Back stock").selectOption("1/4 plywood");
  await recorded(page, "Back stock: 1/4 plywood").toBeVisible();
  // The spec's depths (Operation specs, bookcase: 1/4" dados and end rabbets, 3/8" back rabbets);
  // the Blank case leaves them to the default rule, a third of the side's thickness.
  await page.getByRole("button", { name: "More" }).click();
  await type(page, "Dado depth", '1/4"');
  await recorded(page, 'Dado depth: 1/4"').toBeVisible();
  await type(page, "Rabbet depth", '1/4"');
  await recorded(page, 'Rabbet depth: 1/4"').toBeVisible();
  await type(page, "Back rabbet depth", '3/8"');
  await recorded(page, 'Back rabbet depth: 3/8"').toBeVisible();

  // 3. Divide: the Blank case's opening is empty, so Add shelves → 4 adds them. They are evenly
  //    spaced already, so choosing Evenly spaced records nothing more.
  await page.getByRole("button", { name: "Divide" }).click();
  await page.getByTestId("opening").first().click();
  await page.getByRole("button", { name: "Add shelves" }).click();
  await type(page, "Count", "4");
  await recorded(page, "Added 4 shelves").toBeVisible();
  await page.getByLabel("Spacing").selectOption("Evenly spaced");

  // 4. Joinery: Accept all.
  await page.getByRole("button", { name: "Joinery" }).click();
  await page.getByRole("button", { name: "Accept all" }).click();
  await recorded(page, "Accepted the joinery").toBeVisible();

  // 5. Edge: the shelves → 1/8" roundover on both front edges; the Blank case has none.
  await page.getByTestId("part-group-shelves").click();
  await page.getByRole("button", { name: "Edge profile" }).click();
  await page.getByLabel("Radius").selectOption('1/8"');
  await page.getByRole("button", { name: "Both front edges" }).click();
  await recorded(page, 'Shelf roundover 1/8"').toBeVisible();

  // 6. Build plan: 3 cut list lines, 3 sheets, 3 setups and the assembly order.
  await page.getByRole("button", { name: "Build plan" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
  // 36 − 2 × 23/32 = 34-9/16" between the sides; + 2 × 1/4" dados = 35-1/16" cut.
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('35-1/16"');
  await page.getByRole("tab", { name: "Sheets" }).click();
  await expect(page.getByTestId("sheet")).toHaveCount(3);
  await page.getByRole("tab", { name: "Setups" }).click();
  await expect(page.getByTestId("setup")).toHaveCount(3);
  await page.getByRole("tab", { name: "Assembly" }).click();
  await expect(page.getByTestId("assembly-step")).toHaveCount(4);

  // Then 30" wide: 30 − 2 × 23/32 = 28-9/16" between the sides, 29-1/16" cut.
  await page.getByRole("button", { name: "Shape" }).click();
  await type(page, "Width", '30"');
  await recorded(page, 'Width 36" → 30"').toBeVisible();
  await page.getByRole("button", { name: "Build plan" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('29-1/16"');
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('28-9/16"');
  await page.getByRole("tab", { name: "Setups" }).click();
  await expect(page.getByTestId("setup").first()).toContainText('1/4" deep');
});
