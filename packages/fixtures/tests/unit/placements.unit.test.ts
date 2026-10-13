// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015 rule 8: where each placed board sits, for the viewport and selection.

import { type PlacedPart, type Project, solve, type Vec3 } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const IN = 203200;
const T = (23 * IN) / 32; // 3/4 plywood, 23/32" actual = 146050

/** The 8 corners of a shape mapped through its frame (independent of how the engine builds it). */
function mappedCorners(p: PlacedPart): string[] {
  const out: string[] = [];
  for (const u of [0, p.size.length])
    for (const v of [0, p.size.width])
      for (const w of [0, p.size.thickness]) {
        const at = [0, 1, 2].map(
          (k) =>
            (p.frame.origin[k] ?? 0) +
            u * (p.frame.x[k] ?? 0) +
            v * (p.frame.y[k] ?? 0) +
            w * (p.frame.z[k] ?? 0),
        );
        out.push(at.join(","));
      }
  return out.sort();
}

function boxCorners(min: Vec3, max: Vec3): string[] {
  const out: string[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) out.push([x, y, z].join(","));
  return out.sort();
}

describe("solve().placements", () => {
  const form = loadProject("bookcase", "structure");

  it("places every board of the bookcase once: 2 sides, top, bottom, 4 shelves, back", () => {
    // Operation specs, "Golden test: bookcase": Side ×2, Top/bottom ×2, Shelf ×4, Back ×1 = 9.
    const names = solve(form, shop)
      .placements.map((p) => p.name)
      .sort();
    expect(names).toEqual([
      "Back",
      "Bottom",
      "Left side",
      "Right side",
      "Shelf 1",
      "Shelf 2",
      "Shelf 3",
      "Shelf 4",
      "Top",
    ]);
  });

  it("puts the right side at the origin, 23/32 thick, 12 deep and 72 high", () => {
    // Interaction spec: case 36" W × 72" H × 12" D; the right side stands at x = 0.
    const right = solve(form, shop).placements.find((p) => p.name === "Right side");
    expect(right?.box).toEqual({ min: [0, 0, 0], max: [T, 12 * IN, 72 * IN] });
  });

  it("puts the left side's inside face at 36 - 23/32", () => {
    // 36" - 23/32" = 7315200 - 146050 = 7169150.
    const left = solve(form, shop).placements.find((p) => p.name === "Left side");
    expect(left?.box.min[0]).toBe(7_169_150);
  });

  it("maps each shape's corners exactly onto its box", () => {
    for (const p of solve(form, shop).placements)
      expect(mappedCorners(p)).toEqual(boxCorners(p.box.min, p.box.max));
  });

  it("names the form and role that made a board", () => {
    const shelf = solve(form, shop).placements.find((p) => p.source?.role === "shelf");
    expect(shelf?.source?.role).toBe("shelf");
    expect(shelf?.detached).toBe(false);
    expect(shelf?.pattern?.index).toBeTypeOf("number");
  });

  it("says a shelf is the Shelf part, 34-9/16 visible and cut at 35-1/16", () => {
    // Operation specs, "Golden test: bookcase": shelves 34-9/16" between the sides, cut 35-1/16".
    const shelf = solve(form, shop).placements.find((p) => p.source?.role === "shelf");
    expect(shelf?.partName).toBe("Shelf");
    expect(shelf?.size.length).toBe(7_023_100);
    expect(shelf?.cut.length).toBe(7_124_700);
  });

  it("names the 3/4 plywood as the right side's stock", () => {
    const right = solve(form, shop).placements.find((p) => p.name === "Right side");
    expect(right?.stock).toBe("01K7M3Q8ZD00000000B1000001");
  });

  it("still places every board when an assembly error withholds the shapes", () => {
    // A dado as deep as the side is thick is an error (Operation specs, "Dado": error if ≥ host thickness).
    const broken: Project = structuredClone(form);
    const structure = broken.structures[0];
    if (!structure) throw new Error("form has no structure");
    structure.options.dadoDepth = "23/32in";
    const result = solve(broken, shop);
    expect(result.blocked).toBe(true);
    expect(result.shapes).toEqual([]);
    expect(result.placements).toHaveLength(9);
  });
});
