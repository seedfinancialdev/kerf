// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Assembly geometry: where a part's local frame sits in the parent frame, and where two parts touch.
//
// A part's local frame (Domain model v0, "Part axes & naming"): X is the length, Y the width,
// Z the thickness; faces are end0/end1 (X), edge0/edge1 (Y) and face0/face1 (Z). An instance
// is placed by its orientation (ADR 003) and may be mirrored: a mirrored instance is the part
// reflected across its local Y-Z plane, which swaps the two ends (Operation specs, "Shared rules").
// "Definition space" below means the part's own local frame, before mirroring.

import type { Vec3 } from "../outputs";
import type { Len } from "../types";
import type { SolvedInstance, SolvedPart } from "./model";
import { orientationOf } from "./orientation";

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Frame {
  instance: SolvedInstance;
  part: SolvedPart;
}

export type LocalAxis = 0 | 1 | 2;
export type ParentAxis = 0 | 1 | 2;

const AXES = [0, 1, 2] as const;

/** The part's bounding box in the parent frame. */
export function boxOf(instance: SolvedInstance): Box {
  const { position: p, extent: e } = instance;
  return { min: [p.x, p.y, p.z], max: [p.x + e.x, p.y + e.y, p.z + e.z] };
}

function dimensions(part: SolvedPart): Vec3 {
  return [part.length, part.width, part.thickness];
}

interface AxisMap {
  /** Parent axis this local axis lies along. */
  axis: ParentAxis;
  /** +1 when the local axis points along the parent axis, -1 when against it. */
  sign: 1 | -1;
}

function axisMaps(instance: SolvedInstance): [AxisMap, AxisMap, AxisMap] {
  const o = orientationOf(instance.orientation);
  const mapOf = (image: readonly number[]): AxisMap => {
    for (const axis of AXES) {
      const component = image[axis];
      if (component === 1 || component === -1) return { axis, sign: component };
    }
    throw new Error("unreachable: an orientation axis is a signed unit axis");
  };
  return [mapOf(o.x), mapOf(o.y), mapOf(o.z)];
}

/** A point in definition space expressed in the parent frame. */
export function toParent(frame: Frame, local: Vec3): Vec3 {
  const { instance, part } = frame;
  const dims = dimensions(part);
  const box = boxOf(instance);
  const maps = axisMaps(instance);
  const u: [Len, Len, Len] = [...local];
  if (instance.mirrored) u[0] = dims[0] - u[0];

  const out: [Len, Len, Len] = [0, 0, 0];
  for (const k of AXES) {
    const map = maps[k];
    const value = u[k];
    out[map.axis] = map.sign === 1 ? box.min[map.axis] + value : box.max[map.axis] - value;
  }
  return out;
}

/** A parent-frame point expressed in definition space. */
export function toLocal(frame: Frame, point: Vec3): Vec3 {
  const { instance, part } = frame;
  const dims = dimensions(part);
  const box = boxOf(instance);
  const maps = axisMaps(instance);
  const u: [Len, Len, Len] = [0, 0, 0];
  for (const k of AXES) {
    const map = maps[k];
    u[k] =
      map.sign === 1 ? point[map.axis] - box.min[map.axis] : box.max[map.axis] - point[map.axis];
  }
  if (instance.mirrored) u[0] = dims[0] - u[0];
  return u;
}

/** An axis-aligned region in the parent frame, converted to a definition-space box. */
export function boxToLocal(frame: Frame, region: Box): Box {
  const a = toLocal(frame, region.min);
  const b = toLocal(frame, region.max);
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

export type Contact =
  /** Boxes share a face plane and overlap on it. `patch` is that region, `axis` its normal. */
  | { kind: "touch"; axis: ParentAxis; patch: Box }
  /** Boxes share volume (a corner joint). */
  | { kind: "overlap"; region: Box }
  | { kind: "apart" };

/** How two parts meet, from their bounding boxes. Exact: no tolerances (integer lengths). */
export function contactOf(a: Box, b: Box): Contact {
  const lo: [Len, Len, Len] = [0, 0, 0];
  const hi: [Len, Len, Len] = [0, 0, 0];
  const zero: ParentAxis[] = [];
  for (const k of AXES) {
    lo[k] = Math.max(a.min[k], b.min[k]);
    hi[k] = Math.min(a.max[k], b.max[k]);
    if (hi[k] < lo[k]) return { kind: "apart" };
    if (hi[k] === lo[k]) zero.push(k);
  }
  const region: Box = { min: lo, max: hi };
  if (zero.length === 0) return { kind: "overlap", region };
  const [only] = zero;
  if (zero.length === 1 && only !== undefined) return { kind: "touch", axis: only, patch: region };
  return { kind: "apart" }; // an edge or a corner only: not a seat
}

export interface LocalFace {
  /** Local axis the face is perpendicular to. */
  axis: LocalAxis;
  /** 0 for end0/edge0/face0 (the low side), 1 for the high side. */
  side: 0 | 1;
}

/** Which face of a part a parent-frame plane coincides with. */
export function faceAt(frame: Frame, axis: ParentAxis, coordinate: Len): LocalFace | null {
  const dims = dimensions(frame.part);
  const probe: [Len, Len, Len] = [...boxOf(frame.instance).min];
  probe[axis] = coordinate;
  const local = toLocal(frame, probe);
  const maps = axisMaps(frame.instance);
  for (const k of AXES) {
    if (maps[k].axis !== axis) continue;
    const value = local[k];
    if (value === 0) return { axis: k, side: 0 };
    if (value === dims[k]) return { axis: k, side: 1 };
  }
  return null;
}
