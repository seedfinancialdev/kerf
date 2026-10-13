// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The 24 right-angle orientations (ADR 003, decision D1).
//
// Index = 4 × direction + spin.
//   direction: where the part's local X (length) axis points in the parent frame:
//              +X, -X, +Y, -Y, +Z, -Z  (indices 0-5)
//   spin:      quarter turns about that direction (0-3). Spin 0 puts local Y on a reference
//              axis (+Y for X directions, +Z for Y directions, +X for Z directions); each spin
//              step is a right-handed quarter turn about the new X axis.
// Local Z is always X × Y, so every orientation is a proper rotation. Index 0 is the identity.

import type { Len } from "../types";

export type Axis = readonly [number, number, number];

export interface Orientation {
  /** Where each local axis points in the parent frame. */
  readonly x: Axis;
  readonly y: Axis;
  readonly z: Axis;
}

export const ORIENTATION_COUNT = 24;

const DIRECTIONS: readonly Axis[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Avoids -0, which would compare unequal to 0 under Object.is semantics. */
const clean = (n: number): number => (n === 0 ? 0 : n);

function cross(a: Axis, b: Axis): Axis {
  return [
    clean(a[1] * b[2] - a[2] * b[1]),
    clean(a[2] * b[0] - a[0] * b[2]),
    clean(a[0] * b[1] - a[1] * b[0]),
  ];
}

function negated(a: Axis): Axis {
  return [clean(-a[0]), clean(-a[1]), clean(-a[2])];
}

function referenceFor(direction: Axis): Axis {
  if (direction[0] !== 0) return [0, 1, 0];
  if (direction[1] !== 0) return [0, 0, 1];
  return [1, 0, 0];
}

function build(index: number): Orientation {
  const direction = DIRECTIONS[Math.floor(index / 4)] as Axis;
  const reference = referenceFor(direction);
  const quarter = cross(direction, reference);
  const spins: readonly Axis[] = [reference, quarter, negated(reference), negated(quarter)];
  const y = spins[index % 4] as Axis;
  return { x: direction, y, z: cross(direction, y) };
}

const TABLE: readonly Orientation[] = Array.from({ length: ORIENTATION_COUNT }, (_, i) => build(i));

export function isOrientationIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < ORIENTATION_COUNT;
}

/** Throws RangeError for anything outside 0-23. */
export function orientationOf(index: number): Orientation {
  const found = isOrientationIndex(index) ? TABLE[index] : undefined;
  if (!found) throw new RangeError(`Orientation index must be 0-23, got ${index}`);
  return found;
}

/**
 * The orientation index (ADR 003) whose length axis is `length` and whose width axis is `width`:
 * both signed unit axes of the parent frame, at right angles. Throws RangeError for anything else.
 */
export function orientationFor(length: Axis, width: Axis): number {
  const found = TABLE.findIndex(
    (o) => o.x.every((n, k) => n === length[k]) && o.y.every((n, k) => n === width[k]),
  );
  if (found < 0) {
    throw new RangeError(
      "A board's length and width must lie along two different axes, at right angles.",
    );
  }
  return found;
}

export interface Dimensions {
  length: Len;
  width: Len;
  thickness: Len;
}

/** Size of a part's bounding box along the parent frame's X, Y and Z axes. */
export function extentOf(index: number, dims: Dimensions): { x: Len; y: Len; z: Len } {
  const o = orientationOf(index);
  const along = (axis: 0 | 1 | 2): Len =>
    Math.abs(o.x[axis]) * dims.length +
    Math.abs(o.y[axis]) * dims.width +
    Math.abs(o.z[axis]) * dims.thickness;
  return { x: along(0), y: along(1), z: along(2) };
}
