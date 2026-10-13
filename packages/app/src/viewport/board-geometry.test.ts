// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A board is drawn with flat faces: every face of a plain board looks straight out along one axis,
// and the corners are not shaded as if rounded (ADR 015, rule 8: the blank stands in for the board).

import { INCH } from "@kerf/core";
import { initGeometry } from "@kerf/geometry";
import { beforeAll, describe, expect, it } from "vitest";
import { badgePosition, blankGeometry, geometryOf } from "./board-geometry";
import { meshFor } from "./meshes";

// A 4 × 2 × 1 inch board.
const size = { length: 4 * INCH, width: 2 * INCH, thickness: INCH };

function triangles(
  g: ReturnType<typeof blankGeometry>,
): Array<{ normal: number[]; corners: number[][] }> {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  return Array.from({ length: pos.count / 3 }, (_, t) => ({
    normal: [0, 1, 2].map((i) =>
      i === 0 ? nor.getX(t * 3) : i === 1 ? nor.getY(t * 3) : nor.getZ(t * 3),
    ),
    corners: [0, 1, 2].map((c) => [pos.getX(t * 3 + c), pos.getY(t * 3 + c), pos.getZ(t * 3 + c)]),
  }));
}

describe("blankGeometry()", () => {
  it("has twelve triangles, one per half of each of the six faces", () => {
    expect(triangles(blankGeometry(size))).toHaveLength(12);
  });

  it("gives every corner of a face the same normal, a unit axis", () => {
    const g = blankGeometry(size);
    const nor = g.getAttribute("normal");
    for (let i = 0; i < nor.count; i += 1) {
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)].map((c) => Math.abs(c));
      expect(n.sort()).toEqual([0, 0, 1]);
    }
  });

  it("faces every triangle away from the middle of the board", () => {
    // The board's middle is (2, 1, 0.5); a face looking outward has (corner − middle) · normal > 0.
    for (const { normal, corners } of triangles(blankGeometry(size))) {
      const [c] = corners;
      const toward = [2, 1, 0.5].map((middle, i) => (c?.[i] ?? 0) - middle);
      const along = toward.reduce((sum, d, i) => sum + d * (normal[i] ?? 0), 0);
      expect(along).toBeGreaterThan(0);
    }
  });
});

describe("geometryOf()", () => {
  beforeAll(initGeometry);

  it("draws a plain board's mesh with the same flat unit-axis normals", () => {
    const built = meshFor({ definition: "a", name: "Shelf", ...size, removals: [] });
    const g = geometryOf(built, size);
    const nor = g.getAttribute("normal");
    for (let i = 0; i < nor.count; i += 1) {
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)].map((c) =>
        Math.abs(Math.round(c * 1e4) / 1e4),
      );
      expect(n.sort()).toEqual([0, 0, 1]);
    }
  });

  it("falls back to the blank when the mesh could not be built", () => {
    expect(geometryOf({ ok: false, reason: "x" }, size).getAttribute("position").count).toBe(36);
  });
});

describe("badgePosition()", () => {
  it("floats the warning badge 2 inches over the middle of the board's top, in scene inches", () => {
    // Project box (2, 4, 0)..(6, 8, 10) inches: middle (4, 6), top 10, so the badge is at project
    // (4, 6, 12), which the scene (x, z, -y) puts at (4, 12, -6).
    const box = { min: [2 * INCH, 4 * INCH, 0], max: [6 * INCH, 8 * INCH, 10 * INCH] } as const;
    expect(badgePosition(box)).toEqual([4, 12, -6]);
  });
});
