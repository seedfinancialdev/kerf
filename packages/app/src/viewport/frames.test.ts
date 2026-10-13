// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Each board is drawn where the engine places it. The right side of the 36 × 72 × 12 bookcase
// stands at x 0 to 23/32, y 0 to 12 (back to front), z 0 to 72 (Interaction spec; Task 2's test).

import { INCH, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { matrixOf, toScene } from "./frames";

const placements = solve(
  startProject("Bookcase", "imperial").project,
  loadShopProfile(),
).placements;

function apply(m: number[], p: [number, number, number]): number[] {
  return [0, 1, 2].map(
    (r) => (m[r] ?? 0) * p[0] + (m[4 + r] ?? 0) * p[1] + (m[8 + r] ?? 0) * p[2] + (m[12 + r] ?? 0),
  );
}

const key = (v: number[]): string => v.map((n) => n.toFixed(6)).join(",");

describe("matrixOf()", () => {
  it("puts the right side's far corner at 23/32, 72 up, 12 toward the front", () => {
    const right = placements.find((p) => p.name === "Right side");
    if (!right) throw new Error("no right side");
    const corners = [0, right.size.length].flatMap((u) =>
      [0, right.size.width].flatMap((v) =>
        [0, right.size.thickness].map((w) =>
          key(apply(matrixOf(right.frame), [u / INCH, v / INCH, w / INCH])),
        ),
      ),
    );
    // Scene: x = project x, y = project z (up), z = −project y. Box x 0..0.71875, y 0..72, z −12..0.
    expect(new Set(corners)).toEqual(
      new Set(
        [0, 0.71875].flatMap((x) => [0, 72].flatMap((y) => [-12, 0].map((z) => key([x, y, z])))),
      ),
    );
  });

  it("maps every board's corners onto its box", () => {
    for (const p of placements) {
      const corners = new Set(
        [0, p.size.length].flatMap((u) =>
          [0, p.size.width].flatMap((v) =>
            [0, p.size.thickness].map((w) =>
              key(apply(matrixOf(p.frame), [u / INCH, v / INCH, w / INCH])),
            ),
          ),
        ),
      );
      const box = new Set(
        [p.box.min[0], p.box.max[0]].flatMap((x) =>
          [p.box.min[1], p.box.max[1]].flatMap((y) =>
            [p.box.min[2], p.box.max[2]].map((z) => key(toScene([x / INCH, y / INCH, z / INCH]))),
          ),
        ),
      );
      expect(corners).toEqual(box);
    }
  });
});
