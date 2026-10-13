// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Display meshes for the viewport (Domain model, solve step 7), built by @kerf/geometry and kept by
// content, so a shape is built once however many copies are drawn and however often the project is
// solved. Outputs never read these (ADR 013, D9). The cache is module state, which is allowed
// outside `core`: each entry is a pure function of its key, so it can only return a remembered
// answer, never a wrong one.

import type { PartShape } from "@kerf/core";
import { buildDisplayMesh, type DisplayMesh, MeshError } from "@kerf/geometry";

export type MeshResult = { ok: true; mesh: DisplayMesh } | { ok: false; reason: string };

/** Most meshes kept; beyond this the oldest is dropped, so a long session cannot grow without end. */
const CACHE_LIMIT = 500;
const cache = new Map<string, MeshResult>();

/** The shape's display mesh, or why it cannot be made (ADR 015, rule 10). Call after initGeometry(). */
export function meshFor(shape: PartShape): MeshResult {
  const key = JSON.stringify([shape.length, shape.width, shape.thickness, shape.removals]);
  const found = cache.get(key);
  if (found) return found;
  let result: MeshResult;
  try {
    result = {
      ok: true,
      mesh: buildDisplayMesh(
        { length: shape.length, width: shape.width, thickness: shape.thickness },
        shape.removals,
      ),
    };
  } catch (error) {
    if (!(error instanceof MeshError)) throw error;
    result = { ok: false, reason: error.message };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}
