// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { INCH } from "../units";
import {
  type Axis,
  extentOf,
  isOrientationIndex,
  ORIENTATION_COUNT,
  orientationOf,
} from "./orientation";

// The table as written in ADR 003 (not derived from the code under test).
const ADR_TABLE: ReadonlyArray<readonly [number, string, string, string]> = [
  [0, "+X", "+Y", "+Z"],
  [1, "+X", "+Z", "-Y"],
  [2, "+X", "-Y", "-Z"],
  [3, "+X", "-Z", "+Y"],
  [4, "-X", "+Y", "-Z"],
  [5, "-X", "-Z", "-Y"],
  [6, "-X", "-Y", "+Z"],
  [7, "-X", "+Z", "+Y"],
  [8, "+Y", "+Z", "+X"],
  [9, "+Y", "+X", "-Z"],
  [10, "+Y", "-Z", "-X"],
  [11, "+Y", "-X", "+Z"],
  [12, "-Y", "+Z", "-X"],
  [13, "-Y", "-X", "-Z"],
  [14, "-Y", "-Z", "+X"],
  [15, "-Y", "+X", "+Z"],
  [16, "+Z", "+X", "+Y"],
  [17, "+Z", "+Y", "-X"],
  [18, "+Z", "-X", "-Y"],
  [19, "+Z", "-Y", "+X"],
  [20, "-Z", "+X", "-Y"],
  [21, "-Z", "-Y", "-X"],
  [22, "-Z", "-X", "+Y"],
  [23, "-Z", "+Y", "+X"],
];

const NAMES: Record<string, Axis> = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1],
};

function determinant(x: Axis, y: Axis, z: Axis): number {
  return (
    x[0] * (y[1] * z[2] - y[2] * z[1]) -
    x[1] * (y[0] * z[2] - y[2] * z[0]) +
    x[2] * (y[0] * z[1] - y[1] * z[0])
  );
}

describe("orientation table", () => {
  it("has 24 entries", () => {
    expect(ORIENTATION_COUNT).toBe(24);
    expect(ADR_TABLE).toHaveLength(24);
  });

  it.each(ADR_TABLE)("index %i matches ADR 003 (X→%s, Y→%s, Z→%s)", (index, x, y, z) => {
    const o = orientationOf(index);
    expect(o.x).toEqual(NAMES[x]);
    expect(o.y).toEqual(NAMES[y]);
    expect(o.z).toEqual(NAMES[z]);
  });

  it("every orientation is a proper rotation and all 24 are distinct", () => {
    const seen = new Set<string>();
    for (let i = 0; i < ORIENTATION_COUNT; i += 1) {
      const o = orientationOf(i);
      expect(determinant(o.x, o.y, o.z)).toBe(1);
      seen.add(JSON.stringify([o.x, o.y, o.z]));
    }
    expect(seen.size).toBe(24);
  });

  it("index 0 is the identity", () => {
    expect(orientationOf(0)).toEqual({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  });

  it.each([-1, 24, 1.5, Number.NaN])("rejects %s", (bad) => {
    expect(isOrientationIndex(bad)).toBe(false);
    expect(() => orientationOf(bad)).toThrow(RangeError);
  });
});

describe("extentOf", () => {
  const side = { length: 72 * INCH, width: 12 * INCH, thickness: (23 * INCH) / 32 };

  it("identity keeps length on X, width on Y, thickness on Z", () => {
    expect(extentOf(0, side)).toEqual({ x: 72 * INCH, y: 12 * INCH, z: 146050 });
  });

  it("index 17 stands a side up: thickness on X, width on Y, length on Z", () => {
    expect(extentOf(17, side)).toEqual({ x: 146050, y: 12 * INCH, z: 72 * INCH });
  });

  it("index 1 lays a panel on edge: width on Z, thickness on Y", () => {
    expect(extentOf(1, side)).toEqual({ x: 72 * INCH, y: 146050, z: 12 * INCH });
  });

  it("is the same set of three sizes for every orientation", () => {
    const sorted = [side.length, side.width, side.thickness].sort((a, b) => a - b);
    for (let i = 0; i < ORIENTATION_COUNT; i += 1) {
      const e = extentOf(i, side);
      expect([e.x, e.y, e.z].sort((a, b) => a - b)).toEqual(sorted);
    }
  });
});
