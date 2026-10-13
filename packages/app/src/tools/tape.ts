// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Tape (Interaction spec, "3D tools": "Measure, add guide lines"). Distances along each direction
// are exact; the straight distance is the integer square root, snapped once to the grid. Guide
// lines live for the session and are never saved (ADR 015, D6).

import { gridSize, type Len, type Project, type Vec3 } from "@kerf/core";
import { floorPoint, OFF_THE_FLOOR } from "./drag";
import { recordedProject, type ToolHandler } from "./handler";

/** What the Tape reads between two points: each direction, and the straight line. All are distances (never negative). */
export interface TapeReading {
  leftRight: Len;
  frontBack: Len;
  upDown: Len;
  straight: Len;
}

/** ⌊√n⌋ for a non-negative bigint (Newton's method; exact). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** √n rounded to the nearest multiple of `grid`, half to even, in integer arithmetic. */
function snappedRoot(n: bigint, grid: bigint): bigint {
  const lower = isqrt(n) / grid; // whole grid steps at or below √n (⌊⌊√n⌋/g⌋ = ⌊√n/g⌋)
  // √n against the midpoint (lower + ½)·grid, compared squared: 4n against ((2·lower + 1)·grid)².
  const mid = ((2n * lower + 1n) * grid) ** 2n;
  if (4n * n > mid) return (lower + 1n) * grid;
  if (4n * n < mid) return lower * grid;
  return (lower % 2n === 0n ? lower : lower + 1n) * grid;
}

/**
 * The distances between two points (project units): along x, y and z exactly, and the straight
 * line snapped once to the project's grid, half to even. `units` picks the grid (1/64" or 0.5 mm).
 * Example: (0, 0, 0) to (3", 4", 0) reads 5" straight.
 */
export function measureBetween(a: Vec3, b: Vec3, units: Project["units"]): TapeReading {
  const d = [0, 1, 2].map((i) => Math.abs((b[i] ?? 0) - (a[i] ?? 0)));
  const squares = d.reduce((sum, n) => sum + BigInt(n) * BigInt(n), 0n);
  return {
    leftRight: d[0] ?? 0,
    frontBack: d[1] ?? 0,
    upDown: d[2] ?? 0,
    straight: Number(snappedRoot(squares, BigInt(gridSize(units)))),
  };
}

/** Two clicks measure; the reading shows in the inspector. */
export const tapeTool: ToolHandler = {
  pointer(e, store) {
    if (e.kind !== "down") return;
    const project = recordedProject(store);
    if (!project) return;
    const s = store.getState();
    const point = e.hit?.point ?? floorPoint(e.ray, gridSize(project.units));
    if (!point) {
      s.say(OFF_THE_FLOOR);
      return;
    }
    if (s.pending?.tool === "tape") {
      s.setTape({ from: s.pending.from, to: point });
      s.setPending(null);
    } else {
      s.setTape(null);
      s.setPending({ tool: "tape", from: point });
    }
  },
  prompt: (s) => (s.pending?.tool === "tape" ? "Click the second point" : "Click the first point"),
};
