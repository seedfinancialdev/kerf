// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "3D tools": "drawn between two parts, its length binds to the gap".
// Rules: ADR 015, rule 7.

import { gapBetween, generateStructures, type Id, type Project, solveModel } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { handMadeBookcase as handMade } from "../../src/builders";
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

  it("refuses two boards that do not face each other across a gap", () => {
    const p = handMade();
    expect(gapBetween(p, idOf(p, "Top"), idOf(p, "Right side"))).toMatchObject({ ok: false });
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
