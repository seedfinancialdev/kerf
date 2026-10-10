// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Cut list and nesting spec, "Inputs" (edge trim and minimum offcut are adjustable) and "Outputs"
// (totals per stock: sheets, board feet, linear feet). Expected values are hand calculations
// written beside each case.

import {
  DEFAULT_PLANING_ALLOWANCE,
  INCH,
  nest,
  type Project,
  type ShopProfile,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile(); // kerf 1/8"
// Parts are placed apart so none overlaps another.
const at = (name: string, y = "0in"): InstanceSpec => ({ name, part: name, at: ["0in", y, "0in"] });
const ply = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
});
const wood = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "1/2in",
  stock: "wood",
});
const ruleIds = (p: Project, s: ShopProfile = shop): string[] =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);

describe("edge trim and minimum offcut come from the shop settings", () => {
  const onePanel = boards([ply("A", "40in", "40in")], [at("A")]);

  it("trims sheet goods by nothing unless the shop says so", () => {
    expect(nest(onePanel, shop).sheets[0]?.placements[0]).toMatchObject({ x: 0, y: 0 });
    const trimmed = nest(onePanel, { ...shop, sheetTrim: INCH / 2 });
    // Trim is removed from every side, so the part starts 1/2" in from each edge.
    expect(trimmed.sheets[0]?.placements[0]).toMatchObject({ x: INCH / 2, y: INCH / 2 });
  });

  it("leaves 1/2in at each end of a rough board unless the shop says so", () => {
    // A 10" part needs 10 + 2 x trim: 11" with the default, 12" with 1" of trim.
    const p = boards([wood("W", "10in", "4in")], [at("W")], [], {
      woodLengths: [11 * INCH, 12 * INCH],
    });
    expect(nest(p, shop).boards[0]?.boardLength).toBe(11 * INCH);
    expect(nest(p, { ...shop, solidTrim: INCH }).boards[0]?.boardLength).toBe(12 * INCH);
  });

  it("lists offcuts of 6in or more unless the shop sets another minimum", () => {
    // 40" x 40" on 96" x 48": 96 - 40 - 1/8 = 55-7/8" x 40" beside it, and 48 - 40 - 1/8 = 7-7/8"
    // x 96" above it. Both clear 6"; with an 8" minimum only the first does.
    expect(nest(onePanel, shop).sheets[0]?.offcuts).toHaveLength(2);
    const strict = nest(onePanel, { ...shop, minOffcut: 8 * INCH });
    expect(strict.sheets[0]?.offcuts).toHaveLength(1);
    expect(strict.sheets[0]?.offcuts[0]).toMatchObject({ width: 40 * INCH });
  });

  it.each([
    ["a negative sheet trim", { sheetTrim: -1 }],
    ["a fractional solid trim", { solidTrim: 0.5 }],
    ["a minimum offcut beyond the length limit", { minOffcut: 2 ** 52 }],
    ["a text minimum offcut", { minOffcut: "6in" }],
  ])("reports %s as an invalid shop profile", (_label, extra) => {
    const bad = { ...shop, ...extra } as unknown as ShopProfile;
    expect(ruleIds(onePanel, bad)).toContain("error:invalid-shop");
  });
});

describe("totals per stock", () => {
  it("counts sheets of sheet goods", () => {
    const p = boards(
      [ply("A", "90in", "40in"), ply("B", "90in", "40in")],
      [at("A"), at("B", "50in")],
    );
    // Two 90 x 40 panels cannot share a 96 x 48 sheet.
    const t = nest(p, shop).totals.find((x) => x.sheets !== undefined);
    expect(t).toMatchObject({ sheets: 2 });
    expect(t?.boardFeet).toBeUndefined();
  });

  it("adds board feet of the rough parts and the linear feet bought", () => {
    // Two 10" x 4" parts of 1/2" stock (nominal 1/2": already a quarter multiple).
    // Board feet = 2 x (10 x 4 x 1/2) / 144 = 40/144 = 5/18. They share one board that shrinks to
    // the 48" standard length, so 48" = 4 linear feet.
    const p = boards(
      [wood("A", "10in", "4in"), wood("B", "10in", "4in")],
      [at("A"), at("B", "5in")],
      [],
      {
        woodLengths: [48 * INCH, 96 * INCH],
      },
    );
    const t = nest(p, shop).totals.find((x) => x.boards !== undefined);
    expect(t).toMatchObject({
      boards: 1,
      boardFeet: { num: 5n, den: 18n },
      linearFeet: { num: 4n, den: 1n },
    });
  });

  it("rounds the stock's thickness up to the next quarter inch for board feet", () => {
    // 13/16" stock counts as 4/4 (1"): one 12" x 6" rough part = 12 x 6 x 1 / 144 = 1/2 bf.
    const base = boards([wood("A", "12in", "6in")], [at("A")]);
    const thick: Project = {
      ...base,
      stock: base.stock.map((s) =>
        s.kind === "solid" ? { ...s, thickness: (INCH * 13) / 16 } : s,
      ),
    };
    const t = nest(thick, shop).totals.find((x) => x.boards !== undefined);
    expect(t?.boardFeet).toEqual({ num: 1n, den: 2n });
  });

  it("has none when nothing could be nested", () => {
    const big = boards([ply("Big", "100in", "10in")], [at("Big")]);
    expect(nest(big, shop).totals.every((x) => (x.sheets ?? 0) === 0)).toBe(true);
  });
});

describe("empty match sets", () => {
  it("are said to be empty, not silently ignored", () => {
    const p = boards([ply("A", "10in", "10in")], [at("A")], [], {
      matchSets: [{ name: "Nothing", type: "sameBoard", members: [] }],
    });
    expect(ruleIds(p)).toContain("warning:match-set-empty");
  });
});

describe("the default planing allowance", () => {
  it("is 1/16in a face and is available to callers", () => {
    expect(DEFAULT_PLANING_ALLOWANCE).toBe(INCH / 16);
  });
});
