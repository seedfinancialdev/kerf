// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Build plan, M4 acceptance: "solve under 100 ms"; Charter question 3: resizing re-solves "in under
// 100 ms". Measured in the page, from committing the Width to the cut list showing the new size.

import { expect, test } from "@playwright/test";
import { startBookcase } from "./support/start";

test("a width change reaches the cut list in under 100 ms", async ({ page }) => {
  await startBookcase(page);
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cutlist-line")).toHaveCount(3);
  // The 36" bookcase: 36 - 15/16 = 35-1/16" (hand calculation; bookcase.spec's 30" gives 29-1/16").
  await expect(page.getByTestId("cutlist-line").nth(1)).toContainText('35-1/16"');

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
    while (!line().includes('29-1/16"')) {
      if (performance.now() - start > 2000) {
        throw new Error("the cut list never showed the 30-inch size");
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return performance.now() - start;
  });
  test.info().annotations.push({
    type: "width change to cut list",
    description: `${ms.toFixed(1)} ms`,
  });
  // Budget: the spec's 100 ms. Baseline: 5.9 to 6.2 ms over five runs on the full template when
  // this test was written (INTEGRATION_TEST_STANDARD §5). It runs against `pnpm dev`, React's
  // development build, which is slower than the shipped one, so the figure is conservative.
  expect(ms).toBeLessThan(100);
});
