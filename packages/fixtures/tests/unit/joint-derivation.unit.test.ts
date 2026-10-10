// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Joint derivation on the reference projects (Operation specs). Every coordinate is hand-worked in
// 1/64ths of an inch from the spec's dimensions and the corrected fixture placements:
//   23/32" = 46/64"  1/4" = 16/64"  3/8" = 24/64"  1/2" = 32/64"  12" = 768/64"  72" = 4608/64"
// Primitives are in each part's definition space (local X length, Y width, Z thickness).

import {
  type Derived,
  deriveJoints,
  INCH,
  type Project,
  type RemovalPrimitive,
  solveModel,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject } from "../../src/index";

const q = (n: number): number => (n * INCH) / 64;
const box = (min: [number, number, number], max: [number, number, number]): RemovalPrimitive => ({
  kind: "box",
  min: [q(min[0]), q(min[1]), q(min[2])],
  max: [q(max[0]), q(max[1]), q(max[2])],
});

function derive(project: Project): { derived: Derived; id: (name: string) => string } {
  const model = solveModel(project);
  const derived = deriveJoints(project, model);
  const id = (name: string): string => {
    const found = model.instances.find((i) => i.name === name);
    if (!found) throw new Error(`no instance ${name}`);
    return found.id;
  };
  return { derived, id };
}

describe("bookcase joints", () => {
  const { derived, id } = derive(loadProject("bookcase"));

  it("raises no diagnostics", () => {
    expect(derived.diagnostics).toEqual([]);
  });

  it("cuts 4 dados, 2 end rabbets and the back rabbet in each side, on its inside face", () => {
    // Shelves sit at 14-1/4", 28-33/64", 42-49/64", 57-1/32" (912, 1825, 2737, 3650 in 64ths);
    // each dado is 23/32" wide and 1/4" deep, running the full 12" width. Top and bottom
    // rabbets are 23/32" x 1/4" at the ends; the back rabbet is 1/4" wide, 3/8" deep, full length.
    const expected = [
      box([0, 0, 0], [46, 768, 16]), // bottom end rabbet (end0)
      box([912, 0, 0], [958, 768, 16]),
      box([1825, 0, 0], [1871, 768, 16]),
      box([2737, 0, 0], [2783, 768, 16]),
      box([3650, 0, 0], [3696, 768, 16]),
      box([4608 - 46, 0, 0], [4608, 768, 16]), // top end rabbet (end1)
      box([0, 0, 0], [4608, 16, 24]), // back rabbet (edge0)
    ];
    for (const side of ["Right side", "Left side"]) {
      const cuts = derived.instances.get(id(side))?.cuts ?? [];
      expect(cuts).toHaveLength(7);
      // Compare as sets: the order is the code's fixed order, the content is the spec's.
      expect(new Set(cuts.map((c) => JSON.stringify(c)))).toEqual(
        new Set(expected.map((c) => JSON.stringify(c))),
      );
    }
  });

  it("gives both sides identical cuts, so one definition serves both (mirrored)", () => {
    expect(derived.instances.get(id("Left side"))?.cuts).toEqual(
      derived.instances.get(id("Right side"))?.cuts,
    );
    expect(derived.definitionOf.get(id("Left side"))).toBe(
      derived.definitionOf.get(id("Right side")),
    );
  });

  it("adds the dado and rabbet depth at each end of the shelves, top and bottom", () => {
    // 2 x 1/4" = 1/2" = 32/64": visible 34-9/16" becomes 35-1/16".
    for (const name of ["Shelf 1", "Shelf 4", "Top", "Bottom"]) {
      expect(derived.instances.get(id(name))?.add).toEqual({ length: q(32), width: 0 });
    }
  });

  it("adds the back rabbet depth to the back's width: 2 x 3/8", () => {
    expect(derived.instances.get(id("Back"))?.add).toEqual({ length: 0, width: q(48) });
  });

  it("rounds both front edges of every shelf, and nothing else", () => {
    const rounded = derived.roundedEdges.filter((r) => r.radius === q(8)).map((r) => r.edge);
    expect(rounded).toHaveLength(8); // 4 shelves x 2 edges
    expect(new Set(rounded)).toEqual(new Set(["edge1/face0", "edge1/face1"]));
    expect(derived.roundedEdges).toHaveLength(8);
  });

  it("counts 12 + 2 machined cuts on the sides", () => {
    const sides = new Set([id("Right side"), id("Left side")]);
    const onSides = derived.machined.filter((m) => sides.has(m.host));
    expect(onSides.filter((m) => m.width === q(46) && m.depth === q(16))).toHaveLength(12);
    expect(onSides.filter((m) => m.width === q(16) && m.depth === q(24))).toHaveLength(2);
  });
});

describe("keepsake box joints", () => {
  const { derived, id } = derive(loadProject("box"));

  it("adds the groove depth on all four edges of the bottom: 9 x 5 becomes 9-1/2 x 5-1/2", () => {
    expect(derived.instances.get(id("Bottom"))?.add).toEqual({ length: q(32), width: q(32) });
  });

  it('cuts a 1/4" x 1/4" groove, 1/4" up from the bottom edge, through each wall\'s full length', () => {
    // Inside face is face0 on every wall (z 0 to 1/4"). On Front the bottom edge is edge0 (y = 0);
    // on Back (orientation 3, width runs downward) the same height is y = 4" - 1/2" to 4" - 1/4".
    const front = derived.instances.get(id("Front"))?.cuts.filter((c) => c.kind === "box") ?? [];
    expect(front).toEqual([box([0, 16, 0], [640, 32, 16])]);
    const back = derived.instances.get(id("Back"))?.cuts.filter((c) => c.kind === "box") ?? [];
    expect(back).toEqual([box([0, 224, 0], [640, 240, 16])]);
    for (const side of ["Side A", "Side B"]) {
      const cuts = derived.instances.get(id(side))?.cuts.filter((c) => c.kind === "box") ?? [];
      expect(cuts).toEqual([box([0, 16, 0], [384, 32, 16])]);
    }
  });

  it("lays out three tails and four spaces on each side board, and three sockets on each wall", () => {
    // W = 4", n = 3, p = 1/4", t = 1/2", 1:8: wide tail 1", offset 1/16", narrow 7/8".
    for (const wall of ["Front", "Back"]) {
      const prisms =
        derived.instances.get(id(wall))?.cuts.filter((c) => c.kind === "trapezoidPrism") ?? [];
      expect(prisms).toHaveLength(6); // three sockets at each of the two corners
    }
    for (const side of ["Side A", "Side B"]) {
      const prisms =
        derived.instances.get(id(side))?.cuts.filter((c) => c.kind === "trapezoidPrism") ?? [];
      expect(prisms).toHaveLength(8); // four spaces at each of the two ends
    }
  });

  it('makes tails 1" wide at the tip and 7/8" at the neck', () => {
    const sideA = derived.instances.get(id("Side A"))?.cuts ?? [];
    const spaces = sideA.filter((c) => c.kind === "trapezoidPrism");
    // Interior space between tail 1 and tail 2: at the tip 1-1/4" to 1-1/2" (a pin 1/4" wide),
    // at the baseline widened by the 1/16" slope offset on each side.
    const tipWidths = spaces.map((s) => {
      if (s.kind !== "trapezoidPrism") return 0;
      const ys = s.points.slice(0, 2).map((pt) => pt[1]);
      return Math.abs((ys[1] ?? 0) - (ys[0] ?? 0));
    });
    expect(new Set(tipWidths)).toEqual(new Set([q(16)])); // every space is 1/4" at the tip
    const neck = spaces
      .map((s) =>
        s.kind === "trapezoidPrism"
          ? Math.abs((s.points[2]?.[1] ?? 0) - (s.points[3]?.[1] ?? 0))
          : 0,
      )
      .filter((w) => w !== q(16 + 4)); // 1/4" + 2 x 1/16" = 3/8" = 24/64"
    expect(
      new Set(
        spaces.map((s) =>
          s.kind === "trapezoidPrism"
            ? Math.abs((s.points[2]?.[1] ?? 0) - (s.points[3]?.[1] ?? 0))
            : 0,
        ),
      ),
    ).toEqual(new Set([q(20), q(24)])); // half-pin spaces 5/16" (one slanted side), interior spaces 3/8" (two)
    expect(neck.length).toBeGreaterThan(0);
  });

  it("does not split the two side boards: their cuts are identical", () => {
    expect(derived.definitionOf.get(id("Side A"))).toBe(derived.definitionOf.get(id("Side B")));
    expect(derived.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
