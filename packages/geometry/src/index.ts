// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Display meshes (Domain model v0, solve step 7): the blank minus the union of the removal
// primitives, built with Manifold. Outputs never read this mesh; it exists for the viewport and for
// the "every mesh is manifold" check.
//
// Meshes are in inches as 32-bit floats. That is display geometry only; every length that matters
// stays an integer in `core`.

import { INCH, type RemovalPrimitive } from "@kerf/core";
import Module, { type Manifold, type ManifoldToplevel } from "manifold-3d";

export interface DisplayMesh {
  /** x, y, z triples, in inches. */
  positions: Float32Array;
  /** Triangle vertex indices, counter-clockwise seen from outside. */
  indices: Uint32Array;
}

export interface Blank {
  length: number;
  width: number;
  thickness: number;
}

/** Segments in a roundover arc (Operation specs, "Display"). */
export const ARC_SEGMENTS = 8;

/** Most removals one part may carry; more than any real part needs, and it bounds the cost. */
export const MAX_REMOVALS = 2000;

/** Thrown when a part cannot be turned into a mesh; the message names what is wrong. */
export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshError";
  }
}

let wasm: ManifoldToplevel | undefined;

/** Loads the geometry engine. Await this once before building meshes. */
export async function initGeometry(): Promise<void> {
  if (wasm) return;
  const loaded = await Module();
  loaded.setup();
  wasm = loaded;
}

function engine(): ManifoldToplevel {
  if (!wasm) throw new Error("Call initGeometry() and await it before building a mesh.");
  return wasm;
}

const inches = (n: number): number => n / INCH;

/** Counter-clockwise orientation for a 2D profile, as extrusion requires. */
function ccw(points: Array<[number, number]>): Array<[number, number]> {
  let area = 0;
  for (const [i, p] of points.entries()) {
    const q = points[(i + 1) % points.length] as [number, number];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area < 0 ? [...points].reverse() : points;
}

type Plane = "xy" | "xz" | "yz";

/** Extrudes a profile given in `plane` over `range` along the third axis. */
function prism(
  m: ManifoldToplevel,
  plane: Plane,
  profile: Array<[number, number]>,
  range: readonly [number, number],
  own: (x: Manifold) => Manifold,
): Manifold {
  const solid = own(m.Manifold.extrude([ccw(profile)], range[1] - range[0]));
  if (plane === "xy") return solid.translate([0, 0, range[0]]);
  if (plane === "yz") {
    // (a, b, c) -> (x = c, y = a, z = b)
    return solid.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, range[0], 0, 0, 1]);
  }
  // (a, b, c) -> (x = a, y = range1 - c, z = b)
  return solid.transform([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, range[1], 0, 1]);
}

function removal(
  m: ManifoldToplevel,
  blank: Blank,
  p: RemovalPrimitive,
  own: (x: Manifold) => Manifold,
): Manifold {
  if (p.kind === "box") {
    const min = p.min.map(inches);
    const size = p.max.map((v, i) => inches(v) - (min[i] ?? 0));
    return own(m.Manifold.cube(size as [number, number, number])).translate(
      min as [number, number, number],
    );
  }

  if (p.kind === "trapezoidPrism") {
    const profile = p.points.map(([a, b]) => [inches(a), inches(b)] as [number, number]);
    return prism(m, p.plane, profile, [inches(p.range[0]), inches(p.range[1])], own);
  }

  // Quarter-round along an edge: the corner square minus a quarter disc, as 8 segments.
  const [side, face] = p.edge.split("/") as [string, string];
  const r = inches(p.radius);
  const L = inches(blank.length);
  const W = inches(blank.width);
  const T = inches(blank.thickness);
  const alongX = side === "edge0" || side === "edge1";
  const first = alongX ? (side === "edge0" ? 0 : W) : side === "end0" ? 0 : L;
  const firstDir = side === "edge0" || side === "end0" ? 1 : -1;
  const second = face === "face0" ? 0 : T;
  const secondDir = face === "face0" ? 1 : -1;

  const local: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
    const angle = -Math.PI / 2 - (Math.PI / 2) * (i / ARC_SEGMENTS);
    local.push([r + r * Math.cos(angle), r + r * Math.sin(angle)]);
  }
  const profile = local.map(
    ([u, v]) => [first + firstDir * u, second + secondDir * v] as [number, number],
  );
  return alongX ? prism(m, "yz", profile, [0, L], own) : prism(m, "xz", profile, [0, W], own);
}

function finite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

const EDGE = /^(end0|end1|edge0|edge1)\/(face0|face1)$/;

/** Checks a primitive before it is handed to the engine; throws MeshError naming it. */
function check(blank: Blank, p: RemovalPrimitive, index: number): void {
  const at = `Removal ${index + 1}`;
  if (p.kind === "box") {
    const ok = finite(...p.min, ...p.max) && p.min.every((lo, k) => lo < (p.max[k] ?? Number.NaN));
    if (!ok)
      throw new MeshError(`${at} is a box with no volume (its minimum is not below its maximum).`);
    return;
  }
  if (p.kind === "trapezoidPrism") {
    const ok =
      p.points.length >= 3 &&
      p.points.every(([a, b]) => finite(a, b)) &&
      finite(...p.range) &&
      p.range[0] < p.range[1];
    if (!ok) throw new MeshError(`${at} is a prism with fewer than 3 points or no depth.`);
    return;
  }
  const across = p.edge.startsWith("end") ? blank.length : blank.width;
  if (!EDGE.test(p.edge))
    throw new MeshError(`${at} names an edge that does not exist: ${p.edge}.`);
  if (!(p.radius > 0) || p.radius > blank.thickness || p.radius > across) {
    throw new MeshError(`${at} is a roundover whose radius does not fit the board.`);
  }
}

/**
 * The part's shape: its blank minus every removal. `initGeometry()` must have completed.
 * Throws MeshError for a primitive that cannot be built or a part with no material left.
 */
export function buildDisplayMesh(blank: Blank, removals: readonly RemovalPrimitive[]): DisplayMesh {
  const m = engine();
  if (
    !finite(blank.length, blank.width, blank.thickness) ||
    Math.min(blank.length, blank.width, blank.thickness) <= 0
  ) {
    throw new MeshError("The part has a zero or negative dimension.");
  }
  if (removals.length > MAX_REMOVALS) {
    throw new MeshError(`The part has ${removals.length} cuts; at most ${MAX_REMOVALS} are drawn.`);
  }
  for (const [i, r] of removals.entries()) check(blank, r, i);

  // Every engine object lives in WebAssembly memory and must be freed explicitly.
  const made: Manifold[] = [];
  const own = (x: Manifold): Manifold => {
    made.push(x);
    return x;
  };
  try {
    const solid = own(
      m.Manifold.cube([inches(blank.length), inches(blank.width), inches(blank.thickness)]),
    );
    const cuts = removals.map((r) => own(removal(m, blank, r, own)));
    const result =
      cuts.length === 0 ? solid : own(m.Manifold.difference([solid, own(m.Manifold.union(cuts))]));
    const mesh = result.getMesh();
    if (mesh.triVerts.length === 0) {
      throw new MeshError("The part has no material left after its cuts.");
    }

    const stride = mesh.numProp;
    const count = mesh.vertProperties.length / stride;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = mesh.vertProperties[i * stride] ?? 0;
      positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1] ?? 0;
      positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2] ?? 0;
    }
    return { positions, indices: new Uint32Array(mesh.triVerts) };
  } finally {
    for (const x of made) x.delete();
  }
}

/**
 * Whether the mesh is a closed, consistently oriented 2-manifold: every edge is used by exactly two
 * triangles, once in each direction, and no triangle is degenerate. Checked from the triangles
 * themselves, not from the engine's own opinion.
 */
export function isManifold(mesh: DisplayMesh): boolean {
  const { indices, positions } = mesh;
  if (indices.length === 0 || indices.length % 3 !== 0) return false;
  const vertices = positions.length / 3;
  const edges = new Map<number, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]] as number[];
    if (tri.some((v) => v >= vertices)) return false;
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) return false;
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k] as number;
      const b = tri[(k + 1) % 3] as number;
      const key = a * vertices + b;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (count !== 1) return false; // an edge used twice in one direction
    const a = Math.floor(key / vertices);
    const b = key % vertices;
    if (edges.get(b * vertices + a) !== 1) return false; // no matching reverse edge
  }
  return true;
}

/** Enclosed volume in cubic inches, from the signed tetrahedra of each triangle. */
export function meshVolume(mesh: DisplayMesh): number {
  const { positions: p, indices } = mesh;
  let volume = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [i, j, k] = [indices[t], indices[t + 1], indices[t + 2]] as [number, number, number];
    const ax = p[i * 3] as number;
    const ay = p[i * 3 + 1] as number;
    const az = p[i * 3 + 2] as number;
    const bx = p[j * 3] as number;
    const by = p[j * 3 + 1] as number;
    const bz = p[j * 3 + 2] as number;
    const cx = p[k * 3] as number;
    const cy = p[k * 3 + 1] as number;
    const cz = p[k * 3 + 2] as number;
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}
