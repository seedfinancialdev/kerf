// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The brand's type is bundled with the app (ADR 017, D6-D7): Kerf works offline and calls no font host.

import { expect, test } from "@playwright/test";

test("sets the panels in IBM Plex Sans, loaded from Kerf itself", async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL as string).origin) {
      outside.push(request.url());
    }
  });

  await page.goto("/");

  // document.fonts.check() is true for a family that is not in the font set at all, so look for a
  // loaded face by name instead.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replaceAll('"', ""));
  });
  expect(loaded).toContain("IBM Plex Sans");
  expect(outside).toEqual([]);
});
