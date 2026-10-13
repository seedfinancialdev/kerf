// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// SketchUp-style navigation (Interaction spec, "3D tools"): orbit about a target, pan, zoom, and
// zoom to fit. A view is a target, a distance and two angles; positions follow from them. All
// numbers are scene inches and radians: display floats, never project lengths.

export interface View {
  target: [number, number, number];
  distance: number;
  /** Turn about the vertical, in radians; 0 looks from the front (scene −z). */
  yaw: number;
  /** Tilt, in radians; positive looks down from above. */
  pitch: number;
}

export const FOV_DEGREES = 35;
const DEFAULT_YAW = -0.6; // from the front-right
const DEFAULT_PITCH = 0.35; // a little above
const RADIANS_PER_PIXEL = 0.01;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const NEAREST = 1;
const FARTHEST = 5000;

const halfFov = (): number => ((FOV_DEGREES / 2) * Math.PI) / 180;

/** The default look at a box (scene inches): from the front-right and a little above, filling the view. */
export function fitView(min: [number, number, number], max: [number, number, number]): View {
  const target: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  const distance = Math.max(radius, 1) / Math.sin(halfFov());
  return { target, distance, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH };
}

/**
 * Whether the next frame shows the model framed as it should be: the view has been fitted to the
 * `boards` (a count), or there are none to fit. Until then the model area says it is drawing.
 */
export function isFramed(view: View | null, boards: number): boolean {
  return view !== null || boards === 0;
}

/** Where the camera stands for `v`, in scene inches. */
export function cameraPosition(v: View): [number, number, number] {
  const c = Math.cos(v.pitch);
  return [
    v.target[0] + v.distance * Math.sin(v.yaw) * c,
    v.target[1] + v.distance * Math.sin(v.pitch),
    v.target[2] - v.distance * Math.cos(v.yaw) * c,
  ];
}

/** Turns the view by a pointer drag in pixels; it stops short of straight up and straight down. */
export function orbit(v: View, dxPx: number, dyPx: number): View {
  const pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, v.pitch - dyPx * RADIANS_PER_PIXEL));
  return { ...v, yaw: v.yaw - dxPx * RADIANS_PER_PIXEL, pitch };
}

/** Moves the target with the pointer, scaled so the model follows the cursor. */
export function pan(v: View, dxPx: number, dyPx: number, heightPx: number): View {
  const perPixel = (2 * v.distance * Math.tan(halfFov())) / Math.max(heightPx, 1);
  const right: [number, number, number] = [-Math.cos(v.yaw), 0, -Math.sin(v.yaw)];
  const up: [number, number, number] = [
    -Math.sin(v.yaw) * Math.sin(v.pitch),
    Math.cos(v.pitch),
    Math.cos(v.yaw) * Math.sin(v.pitch),
  ];
  const t = v.target.map(
    (n, i) => n - (right[i] ?? 0) * dxPx * perPixel + (up[i] ?? 0) * dyPx * perPixel,
  ) as [number, number, number];
  return { ...v, target: t };
}

/** Moves closer for a negative wheel delta and farther for a positive one, within limits. */
export function zoom(v: View, wheelDelta: number): View {
  return {
    ...v,
    distance: Math.min(FARTHEST, Math.max(NEAREST, v.distance * 1.1 ** (wheelDelta / 100))),
  };
}
