// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, navigation "matches SketchUp"; Shift+Z zooms to fit. Camera numbers are display
// floats, so they are compared to a hand calculation within 0.1.

import { describe, expect, it } from "vitest";
import { cameraPosition, fitView, isFramed, orbit, pan, zoom } from "./camera";

describe("fitView()", () => {
  it("frames the 36 × 72 × 12 bookcase from its centre", () => {
    const v = fitView([0, 0, -12], [36, 72, 0]);
    expect(v.target).toEqual([18, 36, -6]);
    // Half the diagonal: √(36² + 72² + 12²) / 2 = √6624 / 2 = 40.694; ÷ sin(17.5°) = 0.30071 →
    // 135.33.
    expect(v.distance).toBeCloseTo(135.33, 1);
  });

  it("looks from the front: the camera is on the front side (scene −z) and above", () => {
    const p = cameraPosition(fitView([0, 0, -12], [36, 72, 0]));
    expect(p[2]).toBeLessThan(-6);
    expect(p[1]).toBeGreaterThan(36);
  });
});

describe("orbit()", () => {
  it("never tips past straight up or straight down", () => {
    const v = orbit(fitView([0, 0, 0], [1, 1, 1]), 0, -100_000);
    expect(Math.abs(v.pitch)).toBeLessThan(Math.PI / 2);
  });
});

describe("zoom()", () => {
  it("moves closer when the wheel turns forward", () => {
    const v = fitView([0, 0, 0], [10, 10, 10]);
    expect(zoom(v, -100).distance).toBeLessThan(v.distance);
  });
});

// With yaw 0 the camera sits at scene −z looking toward +z, so the viewer's right is scene −x;
// dragging right moves the model right on screen, so the target moves the other way, toward +x.
describe("pan()", () => {
  it("moves the target toward the viewer's left when the pointer drags right", () => {
    const v = { ...fitView([0, 0, 0], [10, 10, 10]), yaw: 0, pitch: 0 };
    expect(pan(v, 100, 0, 500).target[0]).toBeGreaterThan(v.target[0]);
  });
});

// The model area says "Drawing the model…" until a framed picture is up (Viewport.tsx); an empty
// project has nothing to fit, so its first picture is already framed and the line must go.
describe("isFramed()", () => {
  it("waits for the fit while there are boards and no view yet", () => {
    expect(isFramed(null, 11)).toBe(false);
  });

  it("is framed once the view has been fitted to the boards", () => {
    expect(isFramed(fitView([0, 0, -12], [36, 72, 0]), 11)).toBe(true);
  });

  it("is framed straight away when there are no boards to fit", () => {
    expect(isFramed(null, 0)).toBe(true);
  });
});
