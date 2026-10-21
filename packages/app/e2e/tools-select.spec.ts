// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from "@playwright/test";
import { startBookcase } from "./support/start";

test("tool keys work and E does nothing", async ({ page }) => {
  await startBookcase(page);
  await page.keyboard.press("b");
  await expect(page.getByRole("button", { name: "Board B" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Board B" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Select Space" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
