// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3, New project: "a live 3D preview of the real model, drawn by the engine". The
// screen tests run without WebGL, so only a real browser shows the preview is drawn at all.

import { expect, test } from "@playwright/test";
import { openNewProject } from "./support/start";

test("New project draws the piece in its preview, in a canvas with a size", async ({ page }) => {
  const panel = await openNewProject(page);
  const preview = panel.getByRole("region", { name: "Preview of your piece" });
  const canvas = preview.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  // PREVIEW_NOT_DRAWN (viewport/Preview.tsx) stands in the canvas's place when it cannot draw.
  await expect(preview.getByText("The preview couldn't be drawn")).toHaveCount(0);
});

test("the preview follows a size typed in New project, still drawn", async ({ page }) => {
  const panel = await openNewProject(page);
  await panel.getByRole("button", { name: "Bookcase" }).click();
  await panel.getByLabel("Width").fill('30"');
  const preview = panel.getByRole("region", { name: "Preview of your piece" });
  await expect(preview.locator("canvas")).toBeVisible();
  await expect(preview.getByText("The preview couldn't be drawn")).toHaveCount(0);
});
