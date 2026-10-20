// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3, New project: "a live 3D preview of the real model, drawn by the engine". The
// screen tests run without WebGL, so only a real browser shows the preview is drawn at all. The
// preview marks what it has drawn (`data-drawn`, the piece's width in inches) once a frame of it is
// up, so a spec waits for the picture, never for time.

import { expect, test } from "@playwright/test";
import { openNewProject } from "./support/start";

test("New project draws the piece in its preview", async ({ page }) => {
  const panel = await openNewProject(page);
  await panel.getByRole("button", { name: "Bookcase" }).click();
  const preview = panel.getByRole("region", { name: "Preview of your piece" });
  // The bookcase's usual outside width, 36" (design spec §3).
  await expect(preview.locator("[data-drawn]")).toHaveAttribute("data-drawn", "36");
  // PREVIEW_NOT_DRAWN (viewport/Preview.tsx) stands in the canvas's place when it cannot draw.
  await expect(preview.getByText("The preview couldn't be drawn")).toHaveCount(0);
});

test("the preview draws the piece again at a width typed in New project", async ({ page }) => {
  const panel = await openNewProject(page);
  await panel.getByRole("button", { name: "Bookcase" }).click();
  const preview = panel.getByRole("region", { name: "Preview of your piece" });
  await expect(preview.locator("[data-drawn]")).toHaveAttribute("data-drawn", "36");
  await panel.getByLabel("Width").fill('30"');
  await expect(preview.locator("[data-drawn]")).toHaveAttribute("data-drawn", "30");
  await expect(preview.getByText("The preview couldn't be drawn")).toHaveCount(0);
});
