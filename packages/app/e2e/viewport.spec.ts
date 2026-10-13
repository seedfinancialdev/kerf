// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Viewport (center): … click a part to see its joints". At the default view the
// middle of the bookcase falls between shelves 2 and 3 (gap 29-15/64" to 42-25/32"), so the first
// board under the centre is the back (hand calculation in the plan, Task 24).

import { readFile } from "node:fs/promises";

import { readKerf, writeKerf } from "@kerf/io";
import { expect, test } from "@playwright/test";

test("clicking the middle of the bookcase selects the back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  const box = await model.boundingBox();
  if (!box) throw new Error("no model area");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // The Shape step has a "Back" section too, so the heading is looked for in the inspector.
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "Back" })).toBeVisible();
});

// The canvas appears a few frames before the view can be picked from: until the first picture is
// drawn a click lands on nothing. Holding the page's clock holds the frames, so that wait is seen.
test("the model area says it is drawing until the first picture is up", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  // Held before Shape is clicked: once clicked, the first frame could be drawn before a later hold.
  await page.clock.pauseAt(Date.now() + 60_000);
  await page.getByRole("button", { name: "Shape" }).click();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeVisible();
  await page.clock.resume();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
});

// A project with no boards has nothing to fit, so its first picture is the whole drawing. Such a
// project is opened from a file, then the page is reloaded so the view starts with it.
test("a project with no boards does not keep saying it is drawing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Bookcase" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  const saved = readKerf(await readFile(await (await download).path()));
  const empty = {
    ...saved.project,
    name: "Empty",
    parts: [],
    instances: [],
    patterns: [],
    joints: [],
    matchSets: [],
    structures: [],
  };
  await page.getByLabel("Open a .kerf file").setInputFiles({
    name: "Empty.kerf",
    mimeType: "application/zip",
    buffer: Buffer.from(writeKerf(empty, saved.meta)),
  });
  await expect(page.getByRole("option", { name: "Opened Empty.kerf" })).toBeVisible();
  await page.reload();
  const model = page.getByRole("region", { name: "Model" });
  await expect(model.locator("canvas")).toBeVisible();
  await expect(model.getByText("Drawing the model…")).toBeHidden();
  await expect(model.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
});
