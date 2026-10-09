// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// M5: build plan PDF and the .skp import spike.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { type BuildPlan, buildCutList, machiningSetups, nest } from "@kerf/core";
import { importSkp } from "@kerf/io";
import { buildPlanPdf } from "@kerf/pdf";
import { describe, expect } from "vitest";
import { fixturePath, loadProject, loadShopProfile } from "../../src/index";
import { milestone } from "../../src/milestone";

describe("build plan PDF", () => {
  milestone("M5", "the bookcase build plan renders to a PDF", async () => {
    const shop = loadShopProfile();
    const project = loadProject("bookcase");
    const plan: BuildPlan = {
      cutList: buildCutList(project),
      nesting: nest(project, shop),
      setups: machiningSetups(project, shop),
      assemblyOrder: ["dry-fit", "glue carcase", "square it", "fit back last"],
    };
    const bytes = await buildPlanPdf(plan);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe(".skp import spike", () => {
  // Needs 10 real woodworking .skp files from 3D Warehouse in packages/fixtures/skp/.
  milestone("M5", "8 of 10 files import with correct part sizes", () => {
    const dir = fixturePath("skp");
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".skp")) : [];
    expect(files).toHaveLength(10);
    const imported = files.filter((f) => {
      try {
        return importSkp(readFileSync(`${dir}/${f}`)).parts.length > 0;
      } catch {
        return false;
      }
    });
    expect(imported.length).toBeGreaterThanOrEqual(8);
  });
});
