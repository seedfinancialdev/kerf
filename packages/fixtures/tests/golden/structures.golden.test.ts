// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// M3: the bookcase template -> form -> generated boards must reproduce the same golden outputs,
// with no 3D tools used (Build plan, M3 acceptance).

import {
  buildCutList,
  type CutList,
  detachPart,
  generateStructures,
  type MachiningSetup,
  machiningSetups,
  nest,
} from "@kerf/core";
import { describe, expect } from "vitest";
import { loadExpected, loadProject, loadShopProfile, REFERENCE_PROJECTS } from "../../src/index";
import { milestone } from "../../src/milestone";

const shop = loadShopProfile();

// Generated match-set ids are not fixed by the spec, so block identity is compared by name/order.
function withoutMatchSetIds(cutList: CutList): CutList {
  return { ...cutList, blocks: cutList.blocks.map((b) => ({ ...b, matchSet: "" })) };
}

describe.each(REFERENCE_PROJECTS)("%s from its structure form", (name) => {
  const generated = () => generateStructures(loadProject(name, "structure"), shop);

  milestone("M3", "generated parts give the golden cut list", () => {
    expect(withoutMatchSetIds(buildCutList(generated()))).toEqual(
      withoutMatchSetIds(loadExpected<CutList>(name, "cutlist")),
    );
  });
});

describe("bookcase from its structure form: joinery and shop", () => {
  const generated = () => generateStructures(loadProject("bookcase", "structure"), shop);

  milestone("M3", "generated sheets and setups match the golden files", () => {
    const layouts = loadExpected<{ sheetCountByStock: Record<string, number> }>(
      "bookcase",
      "layouts",
    );
    const setups = loadExpected<{ setups: MachiningSetup[] }>("bookcase", "setups");
    expect(nest(generated(), shop).sheetCountByStock).toEqual(layouts.sheetCountByStock);
    expect(machiningSetups(generated(), shop)).toEqual(setups.setups);
  });

  milestone("M3", "a dado stack in the shop profile proposes dados and rabbets", () => {
    const types = new Set(generated().joints.map((j) => j.type));
    expect(types.has("dado")).toBe(true);
    expect(types.has("rabbet")).toBe(true);
  });

  milestone("M3", "editing one generated board detaches only that board", () => {
    const project = generated();
    const shelf = project.parts.find((p) => p.source?.role === "shelf");
    expect(shelf).toBeDefined();
    const detached = detachPart(project, shelf?.id ?? "");
    expect(detached.detached).toBe(true);
    expect(detached.source?.role).toBe("shelf");
  });
});
