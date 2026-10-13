// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A drag is measured against a line or plane fixed when it began, not against the board that is
// moving under the pointer. Scene is y up; project (x, y, z) is scene (x, z, −y), in inches.

import { INCH, MAX_LENGTH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { pointOnAxis, pointOnPlane, travelOnAxis, viewAxis } from "./drag";

const grid = 3175; // 1/64"

describe("pointOnAxis()", () => {
  it("finds the height on the up line that a sight line passes: 7 inches", () => {
    // Sight line from scene (3, 7, 20) heading to scene −z passes the up line at scene y = 7.
    const ray = { origin: [3, 7, 20], dir: [0, 0, -1] } as const;
    expect(pointOnAxis(ray, [0, 0, 0], 2, grid)).toEqual([0, 0, 7 * INCH]);
  });

  it("keeps the other two coordinates of the start", () => {
    const ray = { origin: [10, 5, 20], dir: [0, 0, -1] } as const;
    expect(pointOnAxis(ray, [2 * INCH, 0, 3 * INCH], 2, grid)).toEqual([2 * INCH, 0, 5 * INCH]);
  });

  it("follows the left-to-right line: a sight line down through scene x = 4", () => {
    const ray = { origin: [4, 10, 6], dir: [0, -1, 0] } as const;
    expect(pointOnAxis(ray, [0, 0, 0], 0, grid)).toEqual([4 * INCH, 0, 0]);
  });

  it("gives the same point for the same sight line, however often it is asked", () => {
    const ray = { origin: [3, 7, 20], dir: [0, 0, -1] } as const;
    expect(pointOnAxis(ray, [0, 0, 0], 2, grid)).toEqual(pointOnAxis(ray, [0, 0, 0], 2, grid));
  });

  it("stays at the start for a sight line parallel to the line", () => {
    const ray = { origin: [0, 0, 20], dir: [0, 1, 0] } as const;
    expect(pointOnAxis(ray, [INCH, 0, 0], 2, grid)).toEqual([INCH, 0, 0]);
  });
});

describe("pointOnAxis() with a sight line that nearly follows the line", () => {
  it("stays at the start when the sight line is almost parallel", () => {
    // 0.0005 off parallel: 1 − cos² is about 2.5e-7, under the threshold.
    const ray = { origin: [0, 0, 20], dir: [0, 1, 0.0005] } as const;
    expect(pointOnAxis(ray, [0, 0, 0], 2, grid)).toEqual([0, 0, 0]);
  });

  it("never leaves the project's range, however far the sight line meets the line", () => {
    // The sight line crosses the up line at 200000 inches below, twice the longest length.
    const ray = { origin: [0, 0, 2000], dir: [0, 1, 0.01] } as const;
    expect(pointOnAxis(ray, [0, 0, 0], 2, grid)).toEqual([0, 0, -MAX_LENGTH]);
  });
});

describe("pointOnPlane()", () => {
  it("meets the plane 2 inches up: scene (3, 2, 4) is project (3, −4, 2) inches", () => {
    const ray = { origin: [3, 10, 4], dir: [0, -1, 0] } as const;
    expect(pointOnPlane(ray, [0, 0, 2 * INCH], 2, grid)).toEqual([3 * INCH, -4 * INCH, 2 * INCH]);
  });

  it("never leaves the project's range for a sight line that grazes the plane", () => {
    const ray = { origin: [0, 5, 0], dir: [1, -0.00001, 0] } as const;
    const [x] = pointOnPlane(ray, [0, 0, 2 * INCH], 2, grid);
    expect(Math.abs(x)).toBeLessThanOrEqual(MAX_LENGTH);
  });

  it("stays at the start for a sight line parallel to the plane", () => {
    const ray = { origin: [0, 5, 0], dir: [1, 0, 0] } as const;
    expect(pointOnPlane(ray, [0, 0, 2 * INCH], 2, grid)).toEqual([0, 0, 2 * INCH]);
  });
});

describe("viewAxis()", () => {
  it("is up (z) for a sight line straight down", () => {
    expect(viewAxis({ origin: [0, 9, 0], dir: [0, -1, 0] })).toBe(2);
  });

  it("is front-to-back (y) for a sight line along the scene's z", () => {
    expect(viewAxis({ origin: [0, 0, 9], dir: [0.1, 0.2, -1] })).toBe(1);
  });
});

describe("travelOnAxis()", () => {
  it("is the lift between two sight lines: from 3 inches up to 5 is 2 inches", () => {
    const began = { origin: [3, 3, 20], dir: [0, 0, -1] } as const;
    const now = { origin: [3, 5, 20], dir: [0, 0, -1] } as const;
    expect(travelOnAxis(now, began, [0, 0, 3 * INCH], 2, grid)).toBe(2 * INCH);
  });

  it("is zero when the sight line has not moved", () => {
    const ray = { origin: [3, 3, 20], dir: [0, 0, -1] } as const;
    expect(travelOnAxis(ray, ray, [0, 0, 3 * INCH], 2, grid)).toBe(0);
  });
});
