// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "3D tools": "drawn between two parts, its length binds to the gap".
// Rules: ADR 015, rule 7.

import { gapBetween, generateStructures, type Id, type Project, solveModel } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, handMadeBookcase as handMade } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();

const idOf = (p: Project, name: string): Id => {
  const found = p.instances.find((i) => i.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found.id;
};

/** The gap's length worked out by the engine, through a parameter that uses it. */
function lengthOf(p: Project, expr: string): number {
  const model = solveModel({
    ...p,
    params: [...p.params, { id: "01K7M3Q8ZD00000000T9000010", name: "gap", expr, kind: "length" }],
  });
  const q = model.params.gap;
  if (!q) throw new Error(JSON.stringify(model.diagnostics));
  return Number(q.value.num / q.value.den);
}

describe("gapBetween()", () => {
  it("measures 34-9/16 between the sides of the 36-inch bookcase", () => {
    // Operation specs: 36 − 2 × 23/32 = 34-9/16" = 7315200 − 292100 = 7023100 units.
    const p = handMade();
    const gap = gapBetween(p, idOf(p, "Right side"), idOf(p, "Left side"));
    expect(gap).toMatchObject({ ok: true, axis: "x" });
    if (gap.ok) expect(lengthOf(p, gap.length)).toBe(7_023_100);
  });

  it("follows the width: 28-9/16 at 30 inches", () => {
    // Operation specs, resize checks: 30 − 2 × 23/32 = 28-9/16" = 5803900.
    const p = handMade();
    const gap = gapBetween(p, idOf(p, "Right side"), idOf(p, "Left side"));
    if (!gap.ok) throw new Error(gap.reason);
    expect(lengthOf(withParam(p, "width", "30in"), gap.length)).toBe(5_803_900);
  });

  it("starts the gap at the right side's inside face, 23/32 from the origin", () => {
    const p = handMade();
    const gap = gapBetween(p, idOf(p, "Left side"), idOf(p, "Right side"));
    if (!gap.ok) throw new Error(gap.reason);
    expect(lengthOf(p, gap.start)).toBe(146_050);
  });

  it("measures 70-9/16 between the bottom and the top, up the z axis", () => {
    // Operation specs: 72 − 2 × 23/32 = 70-9/16" = 14630400 − 292100 = 14338300; starts at 23/32".
    const p = handMade();
    const gap = gapBetween(p, idOf(p, "Bottom"), idOf(p, "Top"));
    expect(gap).toMatchObject({ ok: true, axis: "z" });
    if (!gap.ok) return;
    expect(lengthOf(p, gap.length)).toBe(14_338_300);
    expect(lengthOf(p, gap.start)).toBe(146_050);
  });

  it("follows the height: 58-9/16 at 60 inches", () => {
    // 60 − 2 × 23/32 = 58-9/16" = 12192000 − 292100 = 11899900.
    const p = handMade();
    const gap = gapBetween(p, idOf(p, "Bottom"), idOf(p, "Top"));
    if (!gap.ok) throw new Error(gap.reason);
    expect(lengthOf(withParam(p, "height", "60in"), gap.length)).toBe(11_899_900);
  });

  it("measures along y between two hand-placed boards", () => {
    // The bookcase has no two boards with clear space between them along y (the back touches
    // everything it faces), so two plain boards: first ends at 2in, second starts at 5in: 3in.
    const p = boards(
      [
        { name: "Panel", length: "4in", width: "2in", thickness: "3/4in" },
        { name: "Strip", length: "4in", width: "2in", thickness: "3/4in" },
      ],
      [
        { name: "Near", part: "Panel", at: ["0in", "0in", "0in"] },
        { name: "Far", part: "Strip", at: ["0in", "5in", "0in"] },
      ],
    );
    const gap = gapBetween(p, idOf(p, "Near"), idOf(p, "Far"));
    expect(gap).toMatchObject({ ok: true, axis: "y" });
    if (!gap.ok) return;
    expect(lengthOf(p, gap.length)).toBe(3 * 203_200);
    expect(lengthOf(p, gap.start)).toBe(2 * 203_200);
  });

  describe("with a stock whose name holds a quote or a backslash (PR review tests-M1)", () => {
    /**
     * The hand-made bookcase with its 3/4 plywood renamed `name`, every expression that names it
     * rewritten with `written`, the name as an expression's quoted text spells it.
     */
    function renamed(name: string, written: string): Project {
      const p = handMade();
      const rewrite = (v: unknown): unknown => {
        if (typeof v === "string")
          return v.replaceAll('stock["3/4 plywood"]', `stock["${written}"]`);
        if (Array.isArray(v)) return v.map(rewrite);
        if (v && typeof v === "object")
          return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]));
        return v;
      };
      const q = rewrite(p) as Project;
      return {
        ...q,
        stock: q.stock.map((s) => (s.name === "3/4 plywood" ? { ...s, name } : s)),
      };
    }

    it.each([
      ['3/4" ply', '3/4\\" ply'],
      ["3/4 ply\\", "3/4 ply\\\\"],
    ])("measures 34-9/16 between the sides of stock %s", (name, written) => {
      // The same hand calculation as above: 36 − 2 × 23/32 = 34-9/16" = 7023100 units.
      const p = renamed(name, written);
      expect(solveModel(p).diagnostics).toEqual([]);
      const gap = gapBetween(p, idOf(p, "Right side"), idOf(p, "Left side"));
      if (!gap.ok) throw new Error(gap.reason);
      expect(lengthOf(p, gap.length)).toBe(7_023_100);
    });
  });

  it("refuses boards that touch: they enclose no gap", () => {
    const p = handMade();
    expect(gapBetween(p, idOf(p, "Top"), idOf(p, "Right side"))).toMatchObject({ ok: false });
  });

  it("refuses boards that do not overlap on the other axes", () => {
    // 4in apart along x (0..4in and 8..12in), and 10in apart along y (0..2in and 10..12in): the
    // boards share no y run, so nothing spans between them.
    const p = boards(
      [{ name: "Panel", length: "4in", width: "2in", thickness: "3/4in" }],
      [
        { name: "One", part: "Panel", at: ["0in", "0in", "0in"] },
        { name: "Two", part: "Panel", at: ["8in", "10in", "0in"] },
      ],
    );
    expect(gapBetween(p, idOf(p, "One"), idOf(p, "Two"))).toMatchObject({ ok: false });
  });

  it("refuses a project the engine cannot read: a part names a stock it does not have", () => {
    // validateProject refuses the whole project, so no board is placed and none can be picked.
    const p = { ...handMade(), stock: [] };
    expect(gapBetween(p, idOf(p, "Right side"), idOf(p, "Left side"))).toEqual({
      ok: false,
      reason: "Pick two boards to measure between.",
    });
  });

  it("refuses a member of a row and says to detach it", () => {
    const form = loadProject("bookcase", "structure");
    const g = generateStructures(form, shop);
    const rowId = g.patterns[0]?.id;
    expect(gapBetween(g, `${rowId}:0`, idOf(g, "Right side"))).toEqual({
      ok: false,
      reason: expect.stringContaining("detach"),
    });
  });
});
