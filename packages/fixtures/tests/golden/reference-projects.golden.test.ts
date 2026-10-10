// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Golden tests for both reference projects. Expected values are copied from the Operation specs
// and Cut list & nesting tabs into packages/fixtures/*/expected/. Never edit a fixture to pass.

import {
  type BoardLayout,
  buildCutList,
  type CutList,
  deriveJointCuts,
  type MachiningSetup,
  machiningSetups,
  nest,
  type SheetLayout,
  solve,
} from "@kerf/core";
import { describe, expect } from "vitest";
import { loadExpected, loadProject, loadShopProfile, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";

const shop = loadShopProfile();

describe("bookcase (golden)", () => {
  const project = loadProject("bookcase");

  milestone("M2", "cut list: 3 lines, exactly as the Operation specs table", () => {
    expect(buildCutList(project)).toEqual(loadExpected<CutList>("bookcase", "cutlist"));
  });

  milestone("M2", 'sheet layouts: 2 sheets of 3/4" and 1 of 1/4", exact cuts and offcuts', () => {
    const expected = loadExpected<{
      sheets: SheetLayout[];
      sheetCountByStock: Record<string, number>;
    }>("bookcase", "layouts");
    const result = nest(project, shop);
    // The spec fixes these fields; placements, offcuts and efficiency are checked in the nesting
    // unit tests.
    const specified = result.sheets.map((s) => ({
      stock: s.stock,
      sheet: s.sheet,
      contents: s.contents,
      cutSequence: s.cutSequence,
      largestOffcut: s.largestOffcut,
    }));
    expect(specified).toEqual(expected.sheets);
    expect(result.sheetCountByStock).toEqual(expected.sheetCountByStock);
  });

  milestone(
    "M2",
    "machining setups: dado stack 23/32 x 1/4 (12), 1/4 x 3/8 (2), router (8)",
    () => {
      const expected = loadExpected<{ setups: MachiningSetup[] }>("bookcase", "setups");
      expect(machiningSetups(project, shop)).toEqual(expected.setups);
    },
  );

  milestone("M2", "solves with no errors or warnings", () => {
    expect(solve(project, shop).diagnostics).toEqual([]);
  });

  milestone(
    "M2",
    'resize to 30": shelves 28-9/16" visible, 29-1/16" cut, dado depth stays 1/4"',
    () => {
      const expected = loadExpected<{
        width30: { shelfVisibleLength: number; shelfCutLength: number; dadoDepth: number };
      }>("bookcase", "resize");
      const resized = withParam(project, "width", "30in");
      const line = buildCutList(resized).lines.find((l) => l.parts.some((p) => p.name === "Shelf"));
      expect(line?.length).toBe(expected.width30.shelfCutLength);
      expect(line?.visible.length).toBe(expected.width30.shelfVisibleLength);
      const dado = resized.joints.find((j) => j.type === "dado");
      expect(dado).toBeDefined();
      expect(deriveJointCuts(resized, dado?.id ?? "").guestCutAdd.length).toBe(
        expected.width30.dadoDepth,
      );
    },
  );

  milestone("M2", "shelf count 5: the merged line becomes 7", () => {
    const expected = loadExpected<{ shelfCount5: { mergedLineQuantity: number } }>(
      "bookcase",
      "resize",
    );
    const five = withParam(project, "shelf_count", "5");
    const line = buildCutList(five).lines.find((l) => l.parts.some((p) => p.name === "Shelf"));
    expect(line?.quantity).toBe(expected.shelfCount5.mergedLineQuantity);
  });
});

describe("keepsake box (golden)", () => {
  const project = loadProject("box");

  milestone("M2", "cut list: grain-wrap block of 4 in order, plus the 9-1/2 x 5-1/2 bottom", () => {
    expect(buildCutList(project)).toEqual(loadExpected<CutList>("box", "cutlist"));
  });

  milestone("M2", "match set nests as one composite blank on one walnut board", () => {
    const expected = loadExpected<{ boards: BoardLayout[] }>("box", "layouts");
    expect(nest(project, shop).boards).toEqual(expected.boards);
  });

  milestone("M2", "warns when the groove does not land inside the bottom half-pin", () => {
    const expected = loadExpected<{ warnings: Array<{ rule: string }> }>("box", "validation");
    const { diagnostics } = solve(project, shop);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    for (const warning of expected.warnings) {
      expect(diagnostics.some((d) => d.severity === "warning" && d.rule === warning.rule)).toBe(
        true,
      );
    }
  });
});
