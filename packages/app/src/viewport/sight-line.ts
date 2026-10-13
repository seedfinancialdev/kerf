// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The one place a pointer position becomes a line of sight, so a drag's start and every later
// position are measured by the same arithmetic.

import { type Camera, Raycaster, Vector2 } from "three";
import type { Ray } from "../model/pending";

/** The line of sight under a pointer event, in scene inches. */
export function sightLine(
  e: Pick<MouseEvent, "clientX" | "clientY">,
  canvas: HTMLElement,
  camera: Camera,
): Ray {
  const box = canvas.getBoundingClientRect();
  const at = new Vector2(
    ((e.clientX - box.left) / box.width) * 2 - 1,
    -((e.clientY - box.top) / box.height) * 2 + 1,
  );
  const caster = new Raycaster();
  caster.setFromCamera(at, camera);
  return { origin: caster.ray.origin.toArray(), dir: caster.ray.direction.toArray() };
}
