// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { INCH, type RemovalPrimitive } from "@kerf/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ARC_SEGMENTS,
  type Blank,
  buildDisplayMesh,
  type DisplayMesh,
  initGeometry,
  isManifold,
  meshVolume,
} from "./index";

const q = (n: number): number => (n * INCH) / 64; // sixty-fourths of an inch
// A 12" x 6" x 3/4" board: 768 x 384 x 48 sixty-fourths.
const blank: Blank = { length: q(768), width: q(384), thickness: q(48) };
const BLANK_VOLUME = 12 * 6 * 0.75;

beforeAll(async () => {
  await initGeometry();
});

const box = (min: [number, number, number], max: [number, number, number]): RemovalPrimitive => ({
  kind: "box",
  min: min.map(q) as [number, number, number],
  max: max.map(q) as [number, number, number],
});

describe("buildDisplayMesh", () => {
  it("builds the blank as a closed box with the right volume", () => {
    const mesh = buildDisplayMesh(blank, []);
    expect(isManifold(mesh)).toBe(true);
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME, 4);
    expect(mesh.indices.length / 3).toBe(12); // two triangles per face
  });

  it("removes exactly the volume of a dado cut through the full width", () => {
    // 3/4" wide x 1/4" deep channel across the full 6" width: 0.75 x 0.25 x 6.
    const mesh = buildDisplayMesh(blank, [box([320, 0, 0], [368, 384, 16])]);
    expect(isManifold(mesh)).toBe(true);
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - 0.75 * 0.25 * 6, 4);
  });

  it("removes a rabbet along an end, flush with the board's edges", () => {
    const mesh = buildDisplayMesh(blank, [box([0, 0, 0], [48, 384, 16])]);
    expect(isManifold(mesh)).toBe(true);
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - 0.75 * 0.25 * 6, 4);
  });

  it("removes overlapping cuts once (a dado crossing a rabbet)", () => {
    const mesh = buildDisplayMesh(blank, [
      box([0, 0, 0], [48, 384, 16]),
      box([0, 0, 0], [768, 16, 24]),
    ]);
    expect(isManifold(mesh)).toBe(true);
    // rabbet 0.75 x 6 x 0.25 + back rabbet 12 x 0.25 x 0.375 - overlap 0.75 x 0.25 x 0.25
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - (1.125 + 1.125 - 0.046875), 3);
  });

  it("cuts a roundover as an 8-segment quarter round along an edge", () => {
    // 1/8" radius on the front top edge (edge1/face1) over the 12" length.
    const mesh = buildDisplayMesh(blank, [
      { kind: "quarterRoundSweep", edge: "edge1/face1", radius: q(8) },
    ]);
    expect(isManifold(mesh)).toBe(true);
    const r = 0.125;
    // Area between the corner square and an inscribed 8-segment arc.
    let arc = 0;
    const pts: Array<[number, number]> = [[0, 0]];
    for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
      const a = -Math.PI / 2 - (Math.PI / 2) * (i / ARC_SEGMENTS);
      pts.push([r + r * Math.cos(a), r + r * Math.sin(a)]);
    }
    for (const [i, p] of pts.entries()) {
      const n = pts[(i + 1) % pts.length] as [number, number];
      arc += p[0] * n[1] - n[0] * p[1];
    }
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - (Math.abs(arc) / 2) * 12, 4);
  });

  it("cuts a roundover along an end as well", () => {
    const mesh = buildDisplayMesh(blank, [
      { kind: "quarterRoundSweep", edge: "end0/face0", radius: q(8) },
    ]);
    expect(isManifold(mesh)).toBe(true);
    expect(meshVolume(mesh)).toBeLessThan(BLANK_VOLUME);
  });

  it("cuts dovetail prisms in the xy and yz planes", () => {
    const tail: RemovalPrimitive = {
      kind: "trapezoidPrism",
      plane: "xy",
      points: [
        [q(0), q(64)],
        [q(0), q(128)],
        [q(32), q(144)],
        [q(32), q(48)],
      ],
      range: [0, q(48)],
    };
    const socket: RemovalPrimitive = {
      kind: "trapezoidPrism",
      plane: "yz",
      points: [
        [q(200), 0],
        [q(264), 0],
        [q(256), q(48)],
        [q(208), q(48)],
      ],
      range: [q(736), q(768)],
    };
    for (const cut of [tail, socket]) {
      const mesh = buildDisplayMesh(blank, [cut]);
      expect(isManifold(mesh)).toBe(true);
      expect(meshVolume(mesh)).toBeLessThan(BLANK_VOLUME);
    }
  });

  it("is deterministic", () => {
    const cuts = [box([320, 0, 0], [368, 384, 16])];
    const a = buildDisplayMesh(blank, cuts);
    const b = buildDisplayMesh(blank, cuts);
    expect([...a.positions]).toEqual([...b.positions]);
    expect([...a.indices]).toEqual([...b.indices]);
  });

  it("refuses a part with nothing left", () => {
    expect(() => buildDisplayMesh(blank, [box([0, 0, 0], [768, 384, 48])])).toThrow(/no material/);
  });
});

describe("isManifold", () => {
  let closed: DisplayMesh;
  beforeAll(() => {
    closed = buildDisplayMesh(blank, []);
  });

  it("rejects a mesh with a missing triangle (an open surface)", () => {
    const open: DisplayMesh = { positions: closed.positions, indices: closed.indices.slice(3) };
    expect(isManifold(open)).toBe(false);
  });

  it("rejects an empty mesh and degenerate triangles", () => {
    expect(isManifold({ positions: new Float32Array(), indices: new Uint32Array() })).toBe(false);
    expect(
      isManifold({ positions: new Float32Array(9), indices: new Uint32Array([0, 0, 1]) }),
    ).toBe(false);
  });

  it("rejects a triangle with an inverted winding", () => {
    const flipped = new Uint32Array(closed.indices);
    const a = flipped[0] as number;
    flipped[0] = flipped[1] as number;
    flipped[1] = a;
    expect(isManifold({ positions: closed.positions, indices: flipped })).toBe(false);
  });
});
