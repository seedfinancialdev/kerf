// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Display meshes for the viewport (Domain model, solve step 7), built by @kerf/geometry and kept by
// content, so a shape is built once however many copies are drawn and however often the project is
// solved. Outputs never read these (ADR 013, D9). The cache is module state, which is allowed
// outside `core`: each entry is a pure function of its key, so it can only return a remembered
// answer, never a wrong one.

import type { Id, PartShape, SolveResult } from "@kerf/core";
import { buildDisplayMesh, type DisplayMesh, MeshError } from "@kerf/geometry";

/** A board's display mesh, or why it cannot be made. */
export type MeshResult = { ok: true; mesh: DisplayMesh } | { ok: false; reason: string };

/**
 * Most meshes kept; beyond this the oldest is dropped, so a long session cannot grow without end.
 */
const CACHE_LIMIT = 500;
const cache = new Map<string, MeshResult>();

/** The reason given when the geometry engine itself fails on a shape rather than refusing it. */
const ENGINE_FAULT = "the 3D view's drawing engine failed on this board.";

/**
 * The shape's display mesh, or why it cannot be made (ADR 015, rule 10). A shape the engine
 * refuses gives its reason; one the engine fails on (it throws) gives a reason in shop words, its
 * error is logged once for a bug report, and the failure is remembered like any result, so the
 * engine is not asked again on every frame (second-pass review M3). Call after initGeometry().
 */
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
    if (error instanceof MeshError) result = { ok: false, reason: error.message };
    else {
      console.error(error);
      result = { ok: false, reason: ENGINE_FAULT };
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/**
 * Why each board whose cuts cannot be drawn is drawn as its plain blank, by placed instance (ADR
 * 015, rule 10): the view puts a warning badge on it and the inspector says why. A board with no
 * shape (an error withholds them all) is not listed: it is a blank for that reason instead. Call
 * after initGeometry().
 */
export function undrawnBoards(result: SolveResult): Map<Id, string> {
  const shapes = new Map(result.shapes.map((s) => [s.definition, s]));
  const undrawn = new Map<Id, string>();
  for (const placed of result.placements) {
    const shape = shapes.get(placed.shape);
    const built = shape && meshFor(shape);
    if (built && !built.ok) undrawn.set(placed.instance, built.reason);
  }
  return undrawn;
}
