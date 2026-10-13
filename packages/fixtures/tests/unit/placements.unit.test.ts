// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015 rule 8: where each placed board sits, for the viewport and selection.

import {
  detachPartIn,
  generateStructures,
  type PlacedPart,
  type Project,
  solve,
  type Vec3,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { handMadeBookcase } from "../../src/builders";
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

  it("names each shelf of the row <row id>:<index>, from 0 for the first", () => {
    // PlacedPart.instance: "`<patternId>:<index>` for a member of a row"; the row's source is its
    // first member, index 0 (structures/detach.ts). The bookcase's row has 4 shelves.
    const shelves = solve(form, shop).placements.filter((p) => p.source?.role === "shelf");
    const row = shelves[0]?.pattern?.id;
    expect(shelves.map((p) => p.instance)).toEqual([0, 1, 2, 3].map((i) => `${row}:${i}`));
    expect(shelves.map((p) => p.pattern)).toEqual(
      [0, 1, 2, 3].map((index) => ({ id: row, index })),
    );
  });

  it("says a board the form made is detached once it is taken over by hand", () => {
    const top = solve(form, shop).placements.find((p) => p.name === "Top");
    if (!top) throw new Error("no top");
    // The parts a form makes are written into the project first, as the app's take-over does.
    const after = solve(detachPartIn(generateStructures(form, shop), top.part), shop).placements;
    expect(after.find((p) => p.name === "Top")?.detached).toBe(true);
    expect(after.find((p) => p.name === "Bottom")?.detached).toBe(false);
  });

  it("gives a board made by hand no source, and never calls it detached", () => {
    for (const p of solve(handMadeBookcase(), shop).placements) {
      expect(p.source).toBeUndefined();
      expect(p.detached).toBe(false);
    }
  });

  it("frames the right side from its inside face: length up, width to the front", () => {
    // Orientation 17 (ADR 003): local X (length) to +Z, Y (width) to +Y, Z (thickness) to -X.
    // Thickness runs from the inside face at x = 23/32" (146050) out to x = 0.
    const right = solve(form, shop).placements.find((p) => p.name === "Right side");
    expect(right?.frame).toEqual({
      origin: [T, 0, 0],
      x: [0, 0, 1],
      y: [0, 1, 0],
      z: [-1, 0, 0],
    });
  });

  it("frames the mirrored left side from its inside face, its length still running up", () => {
    // Orientation 23 (ADR 003): X to -Z, Y to +Y, Z to +X; mirrored, the length is reflected
    // (ADR 013, D2), so it runs to +Z from the bottom. Thickness runs from the inside face at
    // x = 36 - 23/32 (7169150) out to the case's outside at 36".
    const left = solve(form, shop).placements.find((p) => p.name === "Left side");
    expect(left?.frame).toEqual({
      origin: [7_169_150, 0, 0],
      x: [0, 0, 1],
      y: [0, 1, 0],
      z: [1, 0, 0],
    });
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
    // A dado as deep as the side is thick is an error (Operation specs, "Dado": error if ≥ host
    // thickness).
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
