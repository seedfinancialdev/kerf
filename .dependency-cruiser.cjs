// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
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
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    exclude: { path: "(^|/)(dist|playwright-report|test-results)(/|$)" },
  },
};
