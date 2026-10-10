// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The reference projects must be built the way the spec describes: guests sit at the shoulder
// (Domain model decision 3, "shoulder-to-shoulder"), the back sits at the back (`edge0`, since
// `edge1` is the front), and a mirrored left side has its inside face as `face0` (ADR 012, D2).
// Joinery is derived from contact between parts, so these placements are inputs to M2.
// Ordinary tests, not milestone tests: they describe the fixtures, which exist today.

import { INCH, orientationOf, solveModel } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject } from "../../src/index";

const SIXTY_FOURTH = INCH / 64;
/** Inches given in 1/64ths, so every expected number is an exact integer. */
const s = (sixtyFourths: number): number => sixtyFourths * SIXTY_FOURTH;

type Range = readonly [number, number];
interface Placement {
  x: Range;
  y: Range;
  z: Range;
}

function placements(
  name: "bookcase" | "box",
): Record<string, Placement & { orientation: number; mirrored: boolean }> {
  const out: Record<string, Placement & { orientation: number; mirrored: boolean }> = {};
  for (const i of solveModel(loadProject(name)).instances) {
    out[i.name] = {
      x: [i.position.x, i.position.x + i.extent.x],
      y: [i.position.y, i.position.y + i.extent.y],
      z: [i.position.z, i.position.z + i.extent.z],
      orientation: i.orientation,
      mirrored: i.mirrored,
    };
  }
  return out;
}

describe("bookcase placement", () => {
  const p = placements("bookcase");
  // 23/32" = 46/64"; 1/4" = 16/64"; 36" = 2304/64"; 72" = 4608/64"; 12" = 768/64".
  const inner: Range = [s(46), s(2304 - 46)]; // between the sides: 23/32" to 35-9/32"

  it("stands the right side at the left edge, front toward +Y", () => {
    expect(p["Right side"]).toMatchObject({
      x: [0, s(46)],
      y: [0, s(768)],
      z: [0, s(4608)],
      orientation: 17,
    });
  });

  it("mirrors the left side across the case and gives it orientation 23", () => {
    expect(p["Left side"]).toMatchObject({
      x: [s(2304 - 46), s(2304)],
      y: [0, s(768)],
      z: [0, s(4608)],
      orientation: 23,
      mirrored: true,
    });
  });

  it("seats the top flush with the sides' top, between them, with the back rabbet behind", () => {
    // y: from the back rabbet width (1/4") to the front edge (12").
    expect(p.Top).toMatchObject({ x: inner, y: [s(16), s(768)], z: [s(4608 - 46), s(4608)] });
  });

  it("seats the bottom between the sides at the base", () => {
    expect(p.Bottom).toMatchObject({ x: inner, y: [s(16), s(768)], z: [0, s(46)] });
  });

  it("seats every shelf between the sides, flush with the front", () => {
    for (const name of ["Shelf 1", "Shelf 2", "Shelf 3", "Shelf 4"]) {
      expect(p[name]).toMatchObject({ x: inner, y: [s(16), s(768)] });
    }
    // Hand calculation (Operation specs, bookcase): 4 evenly spaced shelves, equal air gaps.
    // Span 72" - 2 x 23/32" = 70-9/16"; gap = (70-9/16" - 4 x 23/32") / 5 = 13.5375";
    // first shelf at 23/32" + 13.5375" = 14.25625" -> 14-1/4" on the 1/64" grid.
    expect(p["Shelf 1"]?.z).toEqual([s(912), s(912 + 46)]); // 14-1/4" is 912/64"
  });

  it("puts the back panel at the back edge, filling the opening between the sides", () => {
    expect(p.Back).toMatchObject({ x: inner, y: [0, s(16)], z: [0, s(4608)] });
  });
});

describe("keepsake box placement", () => {
  const p = placements("box");
  // 1/2" = 32/64"; 10" = 640/64"; 6" = 384/64"; 4" = 256/64"; 1/4" = 16/64".

  it("builds the four walls by outside dimensions: 10 x 6 x 4", () => {
    expect(p.Front).toMatchObject({ x: [0, s(640)], y: [0, s(32)], z: [0, s(256)] });
    expect(p.Back).toMatchObject({ x: [0, s(640)], y: [s(384 - 32), s(384)], z: [0, s(256)] });
    expect(p["Side A"]).toMatchObject({ x: [0, s(32)], y: [0, s(384)], z: [0, s(256)] });
    expect(p["Side B"]).toMatchObject({ x: [s(640 - 32), s(640)], y: [0, s(384)], z: [0, s(256)] });
  });

  it('seats the bottom at the shoulder of the walls, 1/4" up from the bottom edge', () => {
    // Interior 9" x 5" (Operation specs, "Bottom check"): from 1/2" in on every side.
    expect(p.Bottom).toMatchObject({
      x: [s(32), s(640 - 32)],
      y: [s(32), s(384 - 32)],
      z: [s(16), s(32)],
    });
  });
});

describe("which face is the show face", () => {
  // Domain model, "Part axes & naming": face0 is the inside/back face, face1 (+Z) the outside/show
  // face. A wall's local +Z therefore points away from the box interior.
  const centre = { x: s(320), y: s(192) }; // centre of the 10" x 6" footprint

  it("points every box wall's +Z away from the centre of the box", () => {
    const walls = ["Front", "Back", "Side A", "Side B"];
    const model = solveModel(loadProject("box"));
    for (const name of walls) {
      const i = model.instances.find((x) => x.name === name);
      expect(i, name).toBeDefined();
      const o = orientationOf(i?.orientation ?? 0);
      // The wall's own centre relative to the box centre: its +Z must point the same way.
      const cx = (i?.position.x ?? 0) + (i?.extent.x ?? 0) / 2 - centre.x;
      const cy = (i?.position.y ?? 0) + (i?.extent.y ?? 0) / 2 - centre.y;
      const outward = Math.abs(cx) > Math.abs(cy) ? [Math.sign(cx), 0] : [0, Math.sign(cy)];
      expect([o.z[0], o.z[1]], name).toEqual(outward);
    }
  });
});
