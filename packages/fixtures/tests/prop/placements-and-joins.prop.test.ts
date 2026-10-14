// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The invariants the 3D view and the Join tool rest on, over every
// reference project resized at random:
//   - ADR 015, rule 8: each placement's frame carries the shape's corner box exactly onto its box;
//   - ADR 015, rule 5: every assembly step names only boards the solve placed;
//   - ADR 015, rule 6: a proposed joint, once accepted, brings no new error, and its host is
//     never thinner than its guest.

import {
  assemblyOrder,
  type Diagnostic,
  type PlacedPart,
  proposeJoint,
  solve,
  type Vec3,
} from "@kerf/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyTurns, RUNS, resizedFixture, resizedHandMadeBookcase, turns } from "../../src/edits";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
/** The id a proposed joint would be saved under. */
const JOINT_ID = "01K7M3Q8ZD00000000T9000031";

/** The 8 corners of the shape's box (0..length, 0..width, 0..thickness) carried by the frame. */
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

describe("placements", () => {
  it("carry each shape's corner box exactly onto the board's box, however it is turned", () => {
    fc.assert(
      fc.property(resizedFixture, turns, (fixture, list) => {
        const placements = solve(applyTurns(fixture, list), shop).placements;
        expect(placements.length).toBeGreaterThan(0);
        for (const p of placements)
          expect(mappedCorners(p)).toEqual(boxCorners(p.box.min, p.box.max));
      }),
      { numRuns: RUNS },
    );
  });
});

describe("assembly order", () => {
  it("names only boards the solve placed, in every step", () => {
    fc.assert(
      fc.property(resizedFixture, (fixture) => {
        const placed = new Set(solve(fixture, shop).placements.map((p) => p.instance));
        for (const step of assemblyOrder(fixture, shop))
          for (const id of step.instances) expect(placed.has(id)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("proposeJoint()", () => {
  const errors = (list: readonly Diagnostic[]): string[] =>
    list
      .filter((d) => d.severity === "error")
      .map((d) => JSON.stringify([d.rule, d.part, d.message, d.count ?? 1]));
  const pick = fc.record({
    // The hand-made bookcase has saved boards and no joints yet, the case the Join tool meets
    // most; the reference projects add joints already made and boards a form made.
    fixture: fc.oneof(resizedHandMadeBookcase, resizedFixture),
    first: fc.nat(),
    second: fc.nat(),
    prefer: fc.constantFrom(undefined, "dado", "rabbet", "throughDovetail" as const),
  });

  it("offers only joints that bring no new error and are never cut into the thinner board", () => {
    let accepted = 0;
    fc.assert(
      fc.property(pick, ({ fixture, first, second, prefer }) => {
        const before = solve(fixture, shop);
        // A joint saved in the project may name only boards saved there (ADR 014, "After
        // review"); the Join tool takes a form's boards over first, so it asks about saved ones.
        const saved = new Set(fixture.instances.map((i) => i.id));
        const boards = before.placements.filter((p) => saved.has(p.instance));
        const a = boards[first % boards.length];
        const b = boards[second % boards.length];
        if (!a || !b) return;
        const r = proposeJoint(fixture, shop, a.instance, b.instance, JOINT_ID, prefer);
        if (!r.ok) return;
        accepted += 1;
        const host = before.placements.find((p) => p.instance === r.joint.host);
        const guest = before.placements.find((p) => p.instance === r.joint.guest);
        if (!host || !guest) throw new Error("the joint names a board that is not placed");
        expect(host.size.thickness).toBeGreaterThanOrEqual(guest.size.thickness);
        const after = solve({ ...fixture, joints: [...fixture.joints, r.joint] }, shop);
        const known = errors(before.diagnostics);
        expect(errors(after.diagnostics).filter((e) => !known.includes(e))).toEqual([]);
      }),
      { numRuns: RUNS },
    );
    // Not vacuous: the hand-made bookcase's top and sides touch, so proposals are offered.
    expect(accepted).toBeGreaterThan(0);
  });
});
