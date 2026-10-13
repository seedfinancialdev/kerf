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
      name: "app-model-has-no-screens",
      comment:
        "The app's model is layer 2: no React, no DOM, no screens (design spec, 'How it is built').",
      severity: "error",
      from: { path: "^packages/app/src/model/" },
      to: {
        path: [
          "^packages/app/src/(state|scene|tools|ui|viewport)/",
          "(^|/)node_modules/(react|react-dom|three|@react-three)(/|$)",
          "^(react|react-dom|three|@react-three/.+)$",
        ],
      },
    },
    {
      name: "app-state-reaches-only-the-model",
      comment: "state/ hands the model's store to the screens; it never imports a screen.",
      severity: "error",
      from: { path: "^packages/app/src/state/" },
      to: { path: "^packages/app/src/(scene|tools|ui|viewport)/" },
    },
    {
      name: "app-scene-is-plain-arithmetic",
      comment:
        "scene/ turns project frames into scene numbers and back; tools and the view share it.",
      severity: "error",
      from: { path: "^packages/app/src/scene/" },
      to: {
        path: [
          "^packages/app/src/(state|tools|ui|viewport)/",
          "(^|/)node_modules/(react|react-dom|three|@react-three)(/|$)",
          "^(react|react-dom|three|@react-three/.+)$",
        ],
      },
    },
    {
      name: "app-tools-are-handlers-not-screens",
      comment:
        "tools/ holds what each tool does to the model; its panels live in ui/ and the canvas in viewport/, so the folders depend one way.",
      severity: "error",
      from: { path: "^packages/app/src/tools/" },
      to: {
        path: [
          "^packages/app/src/(state|ui|viewport)/",
          "(^|/)node_modules/(react|react-dom|three|@react-three)(/|$)",
          "^(react|react-dom|three|@react-three/.+)$",
        ],
      },
    },
    {
      name: "app-viewport-does-not-reach-into-ui",
      comment: "ui/ shows the view's results (meshes); the view never imports a panel.",
      severity: "error",
      from: { path: "^packages/app/src/viewport/" },
      to: { path: "^packages/app/src/ui/" },
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
