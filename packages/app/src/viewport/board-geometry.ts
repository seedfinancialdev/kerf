// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The triangles a board is drawn with. Faces are flat: the geometry is expanded so each triangle
// owns its corners, because normals averaged across a 90° edge would shade a square board as if
// rounded. The blank stands in for a board whose shape is withheld or cannot be built (ADR 015,
// rules 8 and 10).

import { INCH, type PlacedPart } from "@kerf/core";
import { BufferAttribute, BufferGeometry } from "three";
import { toScene } from "../scene/frames";
import type { MeshResult } from "./meshes";

/** Flat-shaded geometry from indexed triangles. */
function flat(positions: ArrayLike<number>, indices: ArrayLike<number>): BufferGeometry {
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  indexed.setIndex(new BufferAttribute(Uint32Array.from(indices), 1));
  const g = indexed.toNonIndexed();
  indexed.dispose();
  g.computeVertexNormals();
  return g;
}

/** The plain blank: a box of the board's finished size, scene inches, from the origin. */
export function blankGeometry(size: PlacedPart["size"]): BufferGeometry {
  const [l, w, t] = [size.length, size.width, size.thickness].map((n) => n / INCH) as [
    number,
    number,
    number,
  ];
  const corners = Array.from({ length: 8 }, (_, i) => i).flatMap((i) => [
    i & 1 ? l : 0,
    i & 2 ? w : 0,
    i & 4 ? t : 0,
  ]);
  // Corner i has bit 0 = length end, bit 1 = width end, bit 2 = thickness end.
  const triangles = [
    0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3,
    5, 3, 7, 5,
  ];
  return flat(corners, triangles);
}

/** The board's cut mesh when it was built, the blank when it was not. */
export function geometryOf(
  built: MeshResult | undefined,
  size: PlacedPart["size"],
): BufferGeometry {
  return built?.ok ? flat(built.mesh.positions, built.mesh.indices) : blankGeometry(size);
}

/** How far the warning badge floats over a board's top, in inches. */
const BADGE_RISE_INCHES = 2;

/**
 * Where the warning badge of a board drawn without its cuts sits (ADR 015, rule 10): over the
 * middle of the board's top, clear of it, in scene inches. `box` is the board's box, project units.
 */
export function badgePosition(box: {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}): [number, number, number] {
  const middle = (i: 0 | 1): number => (box.min[i] + box.max[i]) / 2 / INCH;
  return toScene([middle(0), middle(1), box.max[2] / INCH + BADGE_RISE_INCHES]);
}
