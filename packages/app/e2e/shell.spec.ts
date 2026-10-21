// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Workshop's frame: the four workflow steps in the top bar (ADR 016, D2: Start leaves the top
// bar), on a dark background.

import { expect, test } from "@playwright/test";
import { startBookcase } from "./support/start";

test("shows the four workflow steps in the top bar, on a dark background", async ({ page }) => {
  await startBookcase(page);

  const steps = page.getByRole("navigation", { name: "Workflow" }).getByRole("listitem");
  await expect(steps).toHaveText(["Shape", "Divide", "Joinery", "Build plan"]);

  const [r, g, b] = await page
    .locator("body")
    .evaluate(
      (el) => getComputedStyle(el).backgroundColor.match(/\d+/g)?.map(Number) ?? [255, 255, 255],
    );
  expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThan(80);
});
