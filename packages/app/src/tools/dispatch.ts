// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Turns a pointer event on the model into what a tool needs: the board, the point on the grid and
// the surface's direction, in project terms. Together with drag.ts, the only place scene floats become project integers.

import { gridSize, type PlacedPart, type Vec3 } from "@kerf/core";
import type { ThreeEvent } from "@react-three/fiber";
import type { Camera } from "three";
import type { Ray } from "../model/pending";
import { type KerfStore, shownProject } from "../model/store";
import { fromScene } from "../viewport/frames";
import { sightLine } from "../viewport/sight-line";
import { handlerFor, type ModelHit } from "./pointer";

/** A scene direction back to the signed project axis it is closest to. */
export function axisOf(x: number, y: number, z: number): Vec3 {
  const project = [x, -z, y];
  const sizes = project.map(Math.abs);
  const k = sizes.indexOf(Math.max(...sizes));
  return [0, 1, 2].map((i) => (i === k ? Math.sign(project[i] ?? 0) : 0)) as unknown as Vec3;
}

/**
 * Sends a pointer event on `placed` (or on empty space, when null) to the active tool. A click on
 * empty space is a plain mouse event with no camera of its own, so the view's `camera` gives it its
 * line of sight; a tool can then still find the floor under the pointer.
 */
export function dispatchPointer(
  store: KerfStore,
  kind: "down" | "move" | "up",
  e: ThreeEvent<PointerEvent> | MouseEvent,
  placed: PlacedPart | null,
  camera?: Camera,
): void {
  const s = store.getState();
  const project = shownProject(s);
  // After O or H the left button drags the view; those drags are not picks.
  if (!project || s.navigation) return;
  let hit: ModelHit | null = null;
  if (placed && "point" in e && e.face) {
    const n = e.face.normal.clone().transformDirection(e.object.matrixWorld);
    hit = {
      placed,
      point: fromScene([e.point.x, e.point.y, e.point.z], gridSize(project.units)),
      normal: axisOf(n.x, n.y, n.z),
    };
  }
  // The same arithmetic as every later move of the drag, so a click starts where it ends.
  const native = "nativeEvent" in e ? e.nativeEvent : e;
  const eye = "camera" in e ? e.camera : camera;
  const ray =
    eye && native.target instanceof HTMLElement ? sightLine(native, native.target, eye) : null;
  handlerFor(s.tool).pointer?.(
    { kind, hit, ray, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey },
    store,
  );
}

/**
 * Sends a pointer event of a drag that has begun to the active tool: wherever the pointer is, even
 * off every board, with only its line of sight to measure by. While O or H has the left button,
 * the drag moves the view, never the model (silent-failure review I5).
 */
export function dispatchDrag(
  store: KerfStore,
  kind: "move" | "up",
  ray: Ray,
  keys: { shift: boolean; ctrl: boolean },
): void {
  const s = store.getState();
  if (s.navigation) return;
  handlerFor(s.tool).pointer?.({ kind, hit: null, ray, ...keys }, store);
}
