// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A form in a metric project: 18 mm and 6 mm stock, millimetre sizes. Every length snaps to the
// 0.01 mm grid (80 units), and the same form must build exactly as it does in inches. Expected
// values are hand calculations in millimetres (1 mm = 8,000 units).

import { buildCutList, generateStructures, type Project, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const mm = (n: number): number => n * 8000;

/** The bookcase form re-expressed in millimetres with metric stock. */
function metricBookcase(): Project {
  const base = loadProject("bookcase", "structure");
  const [carcase, back] = base.stock;
  const structure = base.structures[0];
  if (!carcase || !back || !structure) throw new Error("fixture is missing its stock or form");
  const params = new Map([
    ["width", "900mm"],
    ["height", "1800mm"],
    ["depth", "300mm"],
    ["shelf_count", "4"],
  ]);
  return {
    ...base,
    units: "metric",
    params: base.params.map((p) => ({ ...p, expr: params.get(p.name) ?? p.expr })),
    stock: [
      { ...carcase, name: "18 mm plywood", thickness: mm(18) },
      { ...back, name: "6 mm plywood", thickness: mm(6) },
    ],
    structures: [
      {
        ...structure,
        options: {
          ...structure.options,
          dadoDepth: "6mm",
          rabbetDepth: "6mm",
          backRabbetDepth: "9mm",
          shelfRoundover: "3mm",
        },
      },
    ],
  };
}

describe("a case form in a metric project", () => {
  it("builds with no errors or warnings", () => {
    expect(solve(metricBookcase(), shop).diagnostics).toEqual([]);
  });

  it("cuts to the sizes worked out in millimetres", () => {
    // Interior 900 - 2 x 18 = 864. Top, bottom and shelves are 864 visible, +2 x 6 in dados or
    // rabbets = 876 cut, 300 - 6 deep. Sides are 1800 x 300. The back is 1800 x 864, +2 x 9 = 882.
    const lines = buildCutList(generateStructures(metricBookcase(), shop)).lines;
    const sizes = lines.map((l) => [l.length, l.width, l.quantity] as const);
    expect(sizes).toContainEqual([mm(1800), mm(300), 2]);
    expect(sizes).toContainEqual([mm(876), mm(294), 6]);
    expect(sizes).toContainEqual([mm(1800), mm(882), 1]);
  });
});

describe("stock that is not on the project's grid", () => {
  it("is named, because sizes cut from it can disagree by a hair", () => {
    // 23/32" is 146,050 units, not a whole number of 0.01 mm steps (80 units).
    const base = metricBookcase();
    const imperialStock: Project = {
      ...base,
      stock: base.stock.map((s, i) =>
        i === 0 ? { ...s, name: "3/4 plywood", thickness: 146050 } : s,
      ),
    };
    const found = solve(imperialStock, shop).diagnostics.find((d) => d.rule === "stock-off-grid");
    expect(found).toMatchObject({ severity: "warning", field: "3/4 plywood" });
  });

  it("is not named for stock that is on the grid", () => {
    expect(solve(metricBookcase(), shop).diagnostics.map((d) => d.rule)).not.toContain(
      "stock-off-grid",
    );
  });
});
