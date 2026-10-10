// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { notImplemented, type RemovalPrimitive } from "@kerf/core";

/** Display mesh (M2+). Outputs never read this; it is for the viewport only. */
export interface DisplayMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export function buildDisplayMesh(
  _blank: { length: number; width: number; thickness: number },
  _removals: RemovalPrimitive[],
): DisplayMesh {
  return notImplemented("buildDisplayMesh");
}

export function isManifold(_mesh: DisplayMesh): boolean {
  return notImplemented("isManifold");
}
