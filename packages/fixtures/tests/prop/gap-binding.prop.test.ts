// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Invariant (ADR 015, rule 7): a bound gap always equals the clear distance between the two
// boards' facing faces after any resize. Oracle: width − 2 × 23/32 (hand calculation, Operation
// specs), checked against the engine's own placements.

import { gapBetween, solve, solveModel } from "@kerf/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handMadeBookcase } from "../../src/builders";
import { RUNS, widthSixtyFourths } from "../../src/edits";
import { loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const T = 146_050; // 23/32"

describe("gap binding", () => {
  it("equals the clear distance between the sides for every width from 12 to 96 inches", () => {
    const base = handMadeBookcase();
    const id = (name: string): string => base.instances.find((i) => i.name === name)?.id ?? "";
    const gap = gapBetween(base, id("Right side"), id("Left side"));
    if (!gap.ok) throw new Error(gap.reason);
    fc.assert(
      fc.property(widthSixtyFourths, (sixtyFourths) => {
        const p = withParam(base, "width", `${sixtyFourths}/64in`);
        const measured = solveModel({
          ...p,
          params: [
            ...p.params,
            { id: "01K7M3Q8ZD00000000T9000011", name: "gap", expr: gap.length, kind: "length" },
          ],
        }).params.gap;
        const places = solve(p, shop).placements;
        const right = places.find((x) => x.name === "Right side");
        const left = places.find((x) => x.name === "Left side");
        if (!measured || !right || !left) throw new Error("gap or sides missing");
        const value = Number(measured.value.num / measured.value.den);
        expect(value).toBe(sixtyFourths * 3175 - 2 * T);
        expect(value).toBe(left.box.min[0] - right.box.max[0]);
      }),
      { numRuns: RUNS },
    );
  });
});
