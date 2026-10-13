// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/core/src/**/*.test.ts",
            "packages/io/src/**/*.test.ts",
            "packages/geometry/src/**/*.test.ts",
            "packages/fixtures/tests/unit/**/*.test.ts",
          ],
        },
      },
      {
        // The app's model and screens (jsdom stands in for the browser; WebGL is tested end to end).
        plugins: [react()],
        test: {
          name: "app",
          include: ["packages/app/src/**/*.test.{ts,tsx}", "packages/app/e2e/support/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["packages/app/src/test-setup.ts"],
        },
      },
      { test: { name: "golden", include: ["packages/fixtures/tests/golden/**/*.test.ts"] } },
      {
        test: {
          name: "prop",
          include: ["packages/fixtures/tests/prop/**/*.test.ts"],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "stress",
          include: ["packages/fixtures/tests/stress/**/*.test.ts"],
          testTimeout: 60_000,
        },
      },
      { test: { name: "bench", include: ["packages/fixtures/tests/bench/**/*.test.ts"] } },
    ],
  },
});
