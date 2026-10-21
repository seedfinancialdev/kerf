// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Playwright files are .spec.ts; Vitest files are .test.ts and live in src (UNIT_TEST_STANDARD
  // §2).
  testMatch: "**/*.spec.ts",
  timeout: 15_000,
  expect: { timeout: 2_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    actionTimeout: 2_000,
    trace: "retain-on-failure",
    // Every spec starts as a returning user (ADR 016, D8): the shop is set up and the tour has been
    // seen, so a spec meets Home and the Workshop as a regular does. The file is written by hand:
    // `kerf.shop` is STARTER_RECORD (src/model/shop-record.ts) with `setUp: true`, so
    // shopProfileFor gives STARTER_SHOP, the reference shop of the golden bookcase. A first visit
    // (first-run.spec.ts) empties it.
    storageState: "e2e/support/returning-user.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
