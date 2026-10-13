// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Where scene floats become project integers: surface directions and the grid snap
// (Interaction spec, "Measurements": the grid is 1/64" in inches, 0.5 mm in metric).

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { fromScene } from "../viewport/frames";
import { axisOf } from "./dispatch";

describe("axisOf()", () => {
  it("turns scene up into project up (z)", () => {
    expect(axisOf(0, 1, 0)).toEqual([0, 0, 1]);
  });

  it("turns scene −z (toward the viewer) into project front (y)", () => {
    expect(axisOf(0, 0, -1)).toEqual([0, 1, 0]);
  });

  it("keeps the sign and picks the biggest component", () => {
    expect(axisOf(-0.9, 0.2, 0.1)).toEqual([-1, 0, 0]);
  });
});

describe("fromScene()", () => {
  const grid = 3175; // 1/64"

  it("snaps to the nearest grid line: 0.51 inch is 32.64 sixty-fourths, so 33", () => {
    expect(fromScene([0.51, 0, 0], grid)[0]).toBe(33 * grid);
  });

  it("maps scene (x, y, z) to project (x, −z, y)", () => {
    expect(fromScene([1, 2, -3], grid)).toEqual([INCH, 3 * INCH, 2 * INCH]);
  });
});
