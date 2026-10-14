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

/**
 * The result when the geometry engine itself fails on a shape rather than refusing it; one object,
 * so a board drawn again with it keeps its geometry.
 */
const ENGINE_FAULT: MeshResult = {
  ok: false,
  reason: "the 3D view's drawing engine failed on this board.",
};

/** Shapes the engine failed on, with the recorded change they failed under (see `meshFor`). */
const faults = new Map<string, unknown>();

/**
 * The shape's display mesh, or why it cannot be made (ADR 015, rule 10). A shape the engine
 * refuses gives its reason, kept like any result. One the engine fails on (it throws) gives a
 * reason in shop words and its error is logged; that failure is kept only while `attempt` (the
 * recorded History entry) stays the same, so the preview frames of a drag do not ask again, and
 * the next recorded change does: a passing fault is not remembered for the session. Call after initGeometry().
 */
export function meshFor(shape: PartShape, attempt: unknown): MeshResult {
  const key = JSON.stringify([shape.length, shape.width, shape.thickness, shape.removals]);
  const found = cache.get(key);
  if (found) return found;
  if (faults.has(key) && faults.get(key) === attempt) return ENGINE_FAULT;
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
    if (!(error instanceof MeshError)) {
      console.error(error);
      if (faults.size >= CACHE_LIMIT) faults.delete(faults.keys().next().value as string);
      faults.set(key, attempt);
      return ENGINE_FAULT;
    }
    result = { ok: false, reason: error.message };
  }
  faults.delete(key);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/**
 * Why each board whose cuts cannot be drawn is drawn as its plain blank, by placed instance (ADR
 * 015, rule 10): the view puts a warning badge on it and the inspector says why. A board with no
 * shape (an error withholds them all) is not listed: it is a blank for that reason instead.
 * `attempt` is as for `meshFor`. Call after initGeometry().
 */
export function undrawnBoards(result: SolveResult, attempt: unknown): Map<Id, string> {
  const shapes = new Map(result.shapes.map((s) => [s.definition, s]));
  const undrawn = new Map<Id, string>();
  for (const placed of result.placements) {
    const shape = shapes.get(placed.shape);
    const built = shape && meshFor(shape, attempt);
    if (built && !built.ok) undrawn.set(placed.instance, built.reason);
  }
  return undrawn;
}
