// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Playwright files are .spec.ts; Vitest files are .test.ts and live in src (UNIT_TEST_STANDARD §2).
  testMatch: "**/*.spec.ts",
  timeout: 15_000,
  expect: { timeout: 2_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:5173", actionTimeout: 2_000, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
