// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The only end-to-end test that passes at M0: the empty dark window with the five module names.

import { expect, test } from "@playwright/test";

test("shows the five workflow modules in the top bar, on a dark background", async ({ page }) => {
  await page.goto("/");

  const modules = page.getByRole("navigation", { name: "Workflow" }).getByRole("listitem");
  await expect(modules).toHaveText(["Start", "Shape", "Divide", "Joinery", "Build plan"]);

  const [r, g, b] = await page
    .locator("body")
    .evaluate(
      (el) => getComputedStyle(el).backgroundColor.match(/\d+/g)?.map(Number) ?? [255, 255, 255],
    );
  expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThan(80);
});
