// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/core/src/**/*.test.ts", "packages/fixtures/tests/unit/**/*.test.ts"],
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
      { test: { name: "bench", include: ["packages/fixtures/tests/bench/**/*.test.ts"] } },
    ],
  },
});
