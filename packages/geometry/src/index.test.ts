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
  MAX_REMOVALS,
  MeshError,
  meshVolume,
} from "./index";

/** Asserts the call throws an error of this class whose message matches. */
const throwsA = (
  fn: () => unknown,
  cls: abstract new (...args: never[]) => Error,
  message: RegExp,
): void => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(cls);
  expect((caught as Error).message).toMatch(message);
};

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
    throwsA(
      () => buildDisplayMesh(blank, [box([0, 0, 0], [768, 384, 48])]),
      MeshError,
      /no material/,
    );
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

describe("exact volumes (hand calculations)", () => {
  it('a dovetail socket in the yz plane removes 1" wide at the tip, 3/4" at the base', () => {
    // Profile (y, z) in inches: (3.125,0), (4.125,0), (4,0.75), (3.25,0.75). Area = (1 + 0.75)/2
    // x 0.75 = 0.65625 in2, extruded 1/2" along the length: 0.328125 in3.
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
    const mesh = buildDisplayMesh(blank, [socket]);
    expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - 0.328125, 5);
  });

  it("a tail space in the xy plane removes its area through the thickness", () => {
    // Points (x, y) in inches: (0,1), (0,2), (0.5,2.25), (0.5,0.75): shoelace area 0.625 in2,
    // through the 3/4" thickness: 0.46875 in3.
    const space: RemovalPrimitive = {
      kind: "trapezoidPrism",
      plane: "xy",
      points: [
        [0, q(64)],
        [0, q(128)],
        [q(32), q(144)],
        [q(32), q(48)],
      ],
      range: [0, q(48)],
    };
    expect(meshVolume(buildDisplayMesh(blank, [space]))).toBeCloseTo(BLANK_VOLUME - 0.46875, 5);
  });

  it("a roundover removes the corner square minus an 8-segment arc, on every corner kind", () => {
    // Eight triangles at the arc's centre, each pi/16 wide: fan area 4 r2 sin(pi/16). The 8 is the
    // spec's number (Operation specs, "Display"), written out here rather than read from the source.
    const r = 0.125;
    const removedArea = r * r - 4 * r * r * Math.sin(Math.PI / 16);
    const cases: Array<[string, number]> = [
      ["edge0/face0", 12],
      ["edge1/face1", 12],
      ["end0/face1", 6],
      ["end1/face0", 6],
    ];
    for (const [edge, length] of cases) {
      const mesh = buildDisplayMesh(blank, [
        { kind: "quarterRoundSweep", edge: edge as never, radius: q(8) },
      ]);
      expect(isManifold(mesh)).toBe(true);
      expect(meshVolume(mesh)).toBeCloseTo(BLANK_VOLUME - removedArea * length, 4);
    }
  });

  it("the arc has the spec's 8 segments", () => {
    expect(ARC_SEGMENTS).toBe(8);
  });
});

describe("invalid input is a MeshError that names the problem", () => {
  const bad: Array<[string, RemovalPrimitive, RegExp]> = [
    ["a box with min above max", box([100, 0, 0], [50, 384, 16]), /Removal 1 .*no volume/],
    ["a flat box", box([0, 0, 0], [0, 384, 16]), /no volume/],
    ["a box with NaN", { kind: "box", min: [Number.NaN, 0, 0], max: [1, 1, 1] }, /whole numbers/],
    [
      "a prism with two points",
      {
        kind: "trapezoidPrism",
        plane: "xy",
        points: [
          [0, 0],
          [1, 1],
        ],
        range: [0, 1],
      },
      /fewer than 3/,
    ],
    [
      "a prism with no depth",
      {
        kind: "trapezoidPrism",
        plane: "xy",
        points: [
          [0, 0],
          [q(8), 0],
          [q(8), q(8)],
        ],
        range: [0, 0],
      },
      /no depth/,
    ],
    [
      "a roundover of radius 0",
      { kind: "quarterRoundSweep", edge: "edge1/face1", radius: 0 },
      /radius/,
    ],
    [
      "a roundover wider than the board",
      { kind: "quarterRoundSweep", edge: "edge1/face1", radius: q(480) },
      /radius/,
    ],
    [
      "an edge that does not exist",
      { kind: "quarterRoundSweep", edge: "edge9/face1" as never, radius: q(8) },
      /does not exist/,
    ],
  ];

  it.each(bad)("%s", (_label, removal, message) => {
    expect(() => buildDisplayMesh(blank, [removal])).toThrow(MeshError);
    expect(() => buildDisplayMesh(blank, [removal])).toThrow(message);
  });

  it("refuses a blank with a zero or negative dimension", () => {
    throwsA(() => buildDisplayMesh({ ...blank, thickness: 0 }, []), MeshError, /zero or negative/);
  });

  it("refuses more cuts than it will draw", () => {
    const many = Array.from({ length: MAX_REMOVALS + 1 }, () => box([0, 0, 0], [1, 1, 1]));
    throwsA(() => buildDisplayMesh(blank, many), MeshError, /at most/);
  });
});

describe("exact boundaries (second M2 review)", () => {
  it("an end1 roundover sits at the far end of the board", () => {
    const mesh = buildDisplayMesh(blank, [
      { kind: "quarterRoundSweep", edge: "end1/face0", radius: q(8) },
    ]);
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < mesh.positions.length; i += 3)
      pts.push([
        mesh.positions[i] as number,
        mesh.positions[i + 1] as number,
        mesh.positions[i + 2] as number,
      ]);
    expect(pts.some(([x, , z]) => Math.abs(x - 12) < 1e-4 && Math.abs(z - 0.125) < 1e-4)).toBe(
      true,
    );
    expect(pts.some(([x, , z]) => Math.abs(x - 11.875) < 1e-4 && Math.abs(z) < 1e-4)).toBe(true);
  });
  it("a radius equal to the thickness is allowed", () => {
    expect(() =>
      buildDisplayMesh(blank, [{ kind: "quarterRoundSweep", edge: "edge1/face1", radius: q(48) }]),
    ).not.toThrow();
  });
  it("a radius equal to the width is allowed; [G13] one beyond a 1/2in strip is not", () => {
    const strip = { length: q(768), width: q(32), thickness: q(48) };
    expect(() =>
      buildDisplayMesh(strip, [{ kind: "quarterRoundSweep", edge: "edge0/face1", radius: q(32) }]),
    ).not.toThrow();
    expect(() =>
      buildDisplayMesh(strip, [{ kind: "quarterRoundSweep", edge: "edge0/face1", radius: q(40) }]),
    ).toThrow(MeshError);
  });

  it("a box with an infinite corner is a MeshError", () => {
    expect(() =>
      buildDisplayMesh(blank, [
        { kind: "box", min: [Number.NEGATIVE_INFINITY, 0, 0], max: [0, 1, 1] },
      ]),
    ).toThrow(/whole numbers/);
  });
  it("a prism with a NaN point is a MeshError", () => {
    expect(() =>
      buildDisplayMesh(blank, [
        {
          kind: "trapezoidPrism",
          plane: "xy",
          points: [
            [Number.NaN, 0],
            [100, 0],
            [0, 100],
          ],
          range: [0, 10],
        },
      ]),
    ).toThrow(/whole numbers/);
  });
  it("a blank with a NaN length is a MeshError", () => {
    expect(() => buildDisplayMesh({ ...blank, length: Number.NaN }, [])).toThrow(
      /zero or negative/,
    );
  });
});

describe("isManifold on hand-made meshes", () => {
  // A tetrahedron on (0,0,0), (1,0,0), (0,1,0), (0,0,1), triangles counter-clockwise from outside.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const faces = [0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2];
  const mesh = (indices: number[]): DisplayMesh => ({
    positions,
    indices: new Uint32Array(indices),
  });

  it("accepts a closed tetrahedron", () => {
    expect(isManifold(mesh(faces))).toBe(true);
  });

  it("rejects an index list that is not whole triangles", () => {
    expect(isManifold(mesh([...faces, 0]))).toBe(false);
  });

  it("rejects an index beyond the vertices", () => {
    expect(isManifold(mesh([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 9]))).toBe(false);
  });

  it("rejects a repeated triangle (an edge used twice in the same direction)", () => {
    expect(isManifold(mesh([...faces, 0, 2, 1]))).toBe(false);
  });

  it("rejects a mesh with a hole, and a triangle with a repeated vertex", () => {
    expect(isManifold(mesh(faces.slice(0, 9)))).toBe(false);
    expect(isManifold(mesh([0, 0, 1]))).toBe(false);
  });
});

describe("a prism must enclose an area", () => {
  it("refuses points on one line", () => {
    const flat: RemovalPrimitive = {
      kind: "trapezoidPrism",
      plane: "xy",
      points: [
        [0, 0],
        [100, 0],
        [200, 0],
      ],
      range: [0, 10],
    };
    throwsA(() => buildDisplayMesh(blank, [flat]), MeshError, /no area/);
  });
});

describe("the list of cuts", () => {
  it("must be a list", () => {
    expect(() => buildDisplayMesh(blank, {} as never)).toThrow(MeshError);
  });
});
