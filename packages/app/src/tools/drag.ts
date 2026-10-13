// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Where a drag is, measured against something fixed. A drag cannot be measured against the board
// under the pointer, because that board is the thing being moved. Instead the pointer's line of
// sight is projected onto a line or plane chosen when the drag began, so the same line of sight
// always gives the same point. Scene floats come in (inches, y up) and snapped project lengths go out.

import { INCH, type Len, MAX_LENGTH, type Vec3 } from "@kerf/core";
import type { Ray } from "../model/pending";
import { fromScene, toScene } from "../scene/frames";

type Triple = readonly [number, number, number];
type Axis = 0 | 1 | 2;

/** Below this, 1 − cos² of the angle between sight line and axis, they are treated as parallel. */
const PARALLEL = 1e-6;

/** Keeps a projected length inside what the project allows, so a grazing sight line cannot run off. */
const capped = (len: Len): Len => Math.max(-MAX_LENGTH, Math.min(MAX_LENGTH, len));

const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Triple): Triple => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** A project position in scene inches. */
const sceneOf = (p: Vec3): Triple => toScene(p).map((n) => n / INCH) as unknown as Triple;

/** The scene direction of a project axis. */
const sceneAxis = (axis: Axis): Triple =>
  toScene([0, 1, 2].map((i) => (i === axis ? 1 : 0)) as unknown as Vec3);

/**
 * The point on the line through `from` along a project axis that lies closest to the line of
 * sight, snapped to the grid. A line of sight parallel to the axis gives no answer, so `from` stays.
 * Example: from the origin along z (up), a line of sight through scene (3, 7, 20) heading straight
 * down the scene's −z passes the line at height 7", so the point is 7" up.
 */
export function pointOnAxis(ray: Ray, from: Vec3, axis: Axis, grid: Len): Vec3 {
  const a = sceneAxis(axis);
  const d = unit(ray.dir);
  const w = minus(sceneOf(from), ray.origin);
  const b = dot(a, d);
  const apart = 1 - b * b;
  if (apart < PARALLEL) return from;
  const s = (b * dot(d, w) - dot(a, w)) / apart;
  const at = [0, 1, 2].map((i) => (sceneOf(from)[i] ?? 0) + s * (a[i] ?? 0)) as unknown as Triple;
  const out: [Len, Len, Len] = [from[0], from[1], from[2]];
  out[axis] = capped(fromScene(at, grid)[axis]);
  return out;
}

/**
 * Where the line of sight meets the plane through `from` whose normal is a project axis, snapped to
 * the grid. A line of sight parallel to the plane gives no answer, so `from` stays.
 * Example: looking straight down (scene −y) through scene (3, 10, 4) at the plane 2" up meets it at
 * scene (3, 2, 4), which is project (3", −4", 2").
 */
export function pointOnPlane(ray: Ray, from: Vec3, normal: Axis, grid: Len): Vec3 {
  const n = sceneAxis(normal);
  const facing = dot(unit(ray.dir), n);
  if (Math.abs(facing) < 1e-6) return from;
  const t = dot(minus(sceneOf(from), ray.origin), n) / facing;
  const d = unit(ray.dir);
  const at = [0, 1, 2].map((i) => (ray.origin[i] ?? 0) + t * (d[i] ?? 0)) as unknown as Triple;
  return fromScene(at, grid).map(capped) as unknown as Vec3;
}

/** Said when a click that needs a point lands on neither a board nor the floor (`floorPoint`). */
export const OFF_THE_FLOOR = "Click a board, or the floor below the horizon.";

/**
 * Where the line of sight meets the floor (the plane through the project's origin), snapped to the
 * grid. Null when it does not come down onto the floor from above, e.g. a click on the sky.
 */
export function floorPoint(ray: Ray | null, grid: Len): Vec3 | null {
  if (!ray || ray.origin[1] <= 0 || ray.dir[1] >= 0) return null;
  return pointOnPlane(ray, [0, 0, 0], 2, grid);
}

/** The project axis the line of sight runs most nearly along: the plane facing the viewer. */
export function viewAxis(ray: Ray): Axis {
  const v = [ray.dir[0], -ray.dir[2], ray.dir[1]].map(Math.abs);
  return v.indexOf(Math.max(...v)) as Axis;
}

/**
 * How far a drag has travelled along a project axis, signed (negative means toward lower values):
 * the line of sight now, against the one where it began, both projected onto the line through `from`.
 */
export function travelOnAxis(now: Ray, began: Ray, from: Vec3, axis: Axis, grid: Len): Len {
  return pointOnAxis(now, from, axis, grid)[axis] - pointOnAxis(began, from, axis, grid)[axis];
}
