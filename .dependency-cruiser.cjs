// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "app-uses-core-public-api",
      comment: "The app calls the engine only through @kerf/core; internals can change (ADR 015).",
      severity: "error",
      from: { path: "^packages/app/" },
      to: { path: ["^packages/core/src/internal\\.ts$", "^packages/core/src/(?!index\\.ts$)"] },
    },
    {
      name: "app-product-not-fixtures",
      comment: "Test fixtures are for tests; the shipped app never imports them.",
      severity: "error",
      from: { path: "^packages/app/src/(?!.*\\.test\\.tsx?$)" },
      to: { path: "^packages/fixtures/" },
    },
    {
      name: "core-imports-no-other-package",
      comment: "packages/core is the source of truth; it imports nothing from other packages.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: ["^packages/(?!core/)", "^@kerf/(?!core)"] },
    },
    {
      name: "core-imports-no-ui-or-rendering",
      comment: "packages/core imports nothing from React or three.js.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: {
        path: [
          "(^|/)node_modules/(react|react-dom|scheduler|three|@react-three)(/|$)",
          "^(react|react-dom|three|@react-three/.+)$",
        ],
      },
    },
    {
      name: "core-imports-no-dom",
      comment:
        "dependency-cruiser sees imports only; DOM globals are blocked by core's tsconfig (lib without DOM).",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: ["^(jsdom|happy-dom)$", "(^|/)node_modules/(jsdom|happy-dom)(/|$)"] },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // dependency-cruiser does not support TypeScript 7 yet; swc parses the sources instead.
    parser: "swc",
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    exclude: { path: "(^|/)(dist|playwright-report|test-results)(/|$)" },
  },
};
