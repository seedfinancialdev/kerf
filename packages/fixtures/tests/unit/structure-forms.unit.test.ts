// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Case and box construction choices beyond the reference forms (ADR 014, D2 and D4 as extended):
// an applied back, sides between the top and bottom, rabbeted box corners, and a roundover taken
// from the router bits the shop owns. Every size is a hand calculation in the comments
// (1in = 203,200 units; 23/32 plywood, 1/4 plywood back, 1/4 dados and rabbets).

import {
  buildCutList,
  generateStructures,
  INCH,
  type Project,
  type ShopProfile,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const sixty4 = (n: number): number => (n * INCH) / 64;
const withOptions = (p: Project, options: Record<string, string | boolean>): Project => {
  const structure = p.structures[0];
  if (!structure) throw new Error("fixture has no structure");
  return { ...p, structures: [{ ...structure, options: { ...structure.options, ...options } }] };
};
const lines = (p: Project) =>
  buildCutList(p).lines.map((l) => ({
    length: l.length,
    width: l.width,
    quantity: l.quantity,
    names: l.parts.map((x) => x.name),
  }));
const errorsOf = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.filter((d) => d.severity === "error");

describe("a case with an applied back", () => {
  const applied = (): Project =>
    withOptions(loadProject("bookcase", "structure"), { back: "applied" });

  it("builds with no errors or warnings", () => {
    expect(solve(applied(), shop).diagnostics).toEqual([]);
  });

  it("makes the back the full outside, and the shelves the full depth", () => {
    // The back covers the whole case: 72 x 36, 1/4 thick. With no rabbet for it, top, bottom and
    // shelves are the full 12 deep: 34-9/16 + 2 x 1/4 = 35-1/16 cut.
    const found = lines(applied());
    expect(found).toContainEqual({
      length: sixty4(72 * 64),
      width: sixty4(36 * 64),
      quantity: 1,
      names: ["Back"],
    });
    expect(found).toContainEqual({
      length: sixty4(35 * 64 + 4),
      width: sixty4(12 * 64),
      quantity: 6,
      names: ["Top", "Bottom", "Shelf"],
    });
  });

  it("asks for a stock for the back", () => {
    const base = withOptions(loadProject("bookcase", "structure"), { back: "applied" });
    const structure = base.structures[0];
    if (!structure) throw new Error("no structure");
    const options = { ...structure.options };
    delete options.backStock;
    const rules = solve({ ...base, structures: [{ ...structure, options }] }, shop).diagnostics.map(
      (d) => d.rule,
    );
    expect(rules).toContain("structure-stock-missing");
  });
});

describe("a case with the sides between the top and bottom", () => {
  const between = (): Project =>
    withOptions(loadProject("bookcase", "structure"), { topBottom: "sides-between" });

  it("builds with no errors or warnings", () => {
    expect(solve(between(), shop).diagnostics).toEqual([]);
  });

  it("sizes the boards the other way round", () => {
    // Sides run between top and bottom: 72 - 2 x 23/32 = 70-9/16, +2 x 1/4 in the rabbets = 71-1/16.
    // Top and bottom span the full 36, 12 - 1/4 = 11-3/4 wide (the back sits behind them).
    // Shelves are unchanged: 34-9/16 + 2 x 1/4 = 35-1/16 x 11-3/4. The back is 72 x 35-5/16.
    const found = lines(between());
    expect(found).toContainEqual({
      length: sixty4(71 * 64 + 4),
      width: sixty4(12 * 64),
      quantity: 2,
      names: ["Side"],
    });
    expect(found).toContainEqual({
      length: sixty4(36 * 64),
      width: sixty4(11 * 64 + 48),
      quantity: 2,
      names: ["Top", "Bottom"],
    });
    expect(found).toContainEqual({
      length: sixty4(35 * 64 + 4),
      width: sixty4(11 * 64 + 48),
      quantity: 4,
      names: ["Shelf"],
    });
  });
});

describe("a box with rabbeted corners", () => {
  const rabbeted = (): Project =>
    withOptions(loadProject("box", "structure"), { cornerJoint: "rabbet" });

  it("builds with no errors", () => {
    expect(errorsOf(rabbeted())).toEqual([]);
  });

  it("puts the front and back between the sides, each end in a rabbet", () => {
    // Front and back are 10 - 2 x 1/2 = 9 between the sides, +2 x 1/4 in the rabbets (half the
    // 1/2 side) = 9-1/2 cut; sides stay 6. The bottom is the same as in the dovetailed box.
    const blocks = buildCutList(rabbeted()).blocks[0]?.members.map((m) => [m.name, m.length]);
    expect(blocks).toEqual([
      ["Front", sixty4(9 * 64 + 32)],
      ["Side", sixty4(6 * 64)],
      ["Back", sixty4(9 * 64 + 32)],
      ["Side", sixty4(6 * 64)],
    ]);
  });

  it("no longer warns about a groove outside a half-pin, which only dovetails have", () => {
    expect(solve(rabbeted(), shop).diagnostics.map((d) => d.rule)).not.toContain(
      "groove-outside-bottom-half-pin",
    );
  });
});

describe("a shelf roundover taken from the shop's bits", () => {
  const auto = (): Project =>
    withOptions(loadProject("bookcase", "structure"), { shelfRoundover: "auto" });
  const withBits = (bits: number[]): ShopProfile => ({
    ...shop,
    tools: [
      ...shop.tools.filter((t) => t.type !== "router"),
      { type: "router", straightBits: [], roundoverBits: bits },
    ],
  });
  const shelfRadius = (p: Project, s: ShopProfile): string | undefined =>
    generateStructures(p, s).parts.find((x) => x.name === "Shelf")?.ops[0]?.radius;

  it("uses the largest bit that leaves room for a profile on both faces", () => {
    // A 23/32 shelf has room for a radius of 23/64 (73,025 units) on each face. Of 1/8, 1/4 and
    // 1/2 inch bits, 1/4 inch (50,800 units) is the largest that fits.
    expect(shelfRadius(auto(), withBits([25400, 50800, 101600]))).toBe("50800/203200in");
  });

  it("uses the bit it has when only one is owned", () => {
    expect(shelfRadius(auto(), shop)).toBe("25400/203200in");
  });

  it("makes no roundover when no router or no bit fits", () => {
    expect(shelfRadius(auto(), withBits([]))).toBeUndefined();
    expect(shelfRadius(auto(), withBits([101600]))).toBeUndefined();
  });
});
