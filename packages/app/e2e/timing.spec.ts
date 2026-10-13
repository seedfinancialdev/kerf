// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Build plan, M4 acceptance: "solve under 100 ms"; Charter question 3: resizing re-solves "in under
// 100 ms". Measured in the page, from committing the Width to the cut list showing the new size.

import { expect, test } from "@playwright/test";

test("a width change reaches the cut list in under 100 ms", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);

  const ms = await page.evaluate(async () => {
    const label = [...document.querySelectorAll("label")].find((l) => l.textContent === "Width");
    const input = label?.control as HTMLInputElement | null;
    if (!input) throw new Error("no Width field");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    input.focus();
    setValue?.call(input, '30"');
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const start = performance.now();
    input.blur();
    const line = () =>
      document.querySelectorAll('[data-testid="cutlist-line"]')[1]?.textContent ?? "";
    while (!line().includes('29-1/16"')) await new Promise((r) => requestAnimationFrame(r));
    return performance.now() - start;
  });
  expect(ms).toBeLessThan(100);
});
