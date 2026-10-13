// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// From the engine's placements to the 3D scene. The project frame is x left-right, y back to front,
// z up; the scene is y up. (x, y, z) → (x, z, −y) is a rotation (determinant +1), so only mirrored
// boards get a flipped matrix, which three.js draws correctly. Scene units are inches (display
// only).

import { INCH, type Len, type PlacedPart, type Vec3 } from "@kerf/core";

/** A length in project units as scene inches (display only). */
export const inches = (n: number): number => n / INCH;

/** A point or direction from the project frame to the scene; both in the unit given. */
export function toScene(v: readonly [number, number, number]): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

/**
 * A scene point (inches) back in project units, snapped to the grid; the only float → integer step.
 */
export function fromScene(v: readonly [number, number, number], grid: Len): Vec3 {
  const snap = (sceneInches: number): Len => Math.round((sceneInches * INCH) / grid) * grid;
  return [snap(v[0]), snap(-v[2]), snap(v[1])];
}

/** The board's placement as a column-major 4x4 matrix, from shape inches to scene inches. */
export function matrixOf(frame: PlacedPart["frame"]): number[] {
  const x = toScene(frame.x);
  const y = toScene(frame.y);
  const z = toScene(frame.z);
  const o = toScene(frame.origin).map((n) => n / INCH);
  return [
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    o[0] ?? 0,
    o[1] ?? 0,
    o[2] ?? 0,
    1,
  ];
}
