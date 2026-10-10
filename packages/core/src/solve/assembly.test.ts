// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { INCH } from "../units";
import { boxOf, boxToLocal, contactOf, faceAt, toLocal, toParent } from "./assembly";
import type { SolvedInstance, SolvedPart } from "./model";

const q = (n: number): number => (n * INCH) / 64; // n sixty-fourths of an inch

const part = (length: number, width: number, thickness: number): SolvedPart => ({
  id: "p",
  name: "p",
  stock: "s",
  length,
  width,
  thickness,
  grainLocked: true,
  ops: [],
});

function instance(
  at: [number, number, number],
  extent: [number, number, number],
  orientation: number,
  mirrored = false,
): SolvedInstance {
  return {
    id: "i",
    def: "p",
    name: "i",
    position: { x: at[0], y: at[1], z: at[2] },
    extent: { x: extent[0], y: extent[1], z: extent[2] },
    orientation,
    mirrored,
  };
}

// The bookcase sides (Operation specs: 72 x 12 x 23/32). 23/32" = 46/64"; 72" = 4608/64";
// 12" = 768/64"; the case is 36" = 2304/64" wide.
const side = part(q(4608), q(768), q(46));
// Right side: standing, x from 0 to 23/32". Orientation 17: local X -> +Z, Y -> +Y, Z -> -X.
const right = { instance: instance([0, 0, 0], [q(46), q(768), q(4608)], 17), part: side };
// Left side: orientation 23 (X -> -Z, Y -> +Y, Z -> +X), mirrored, at the far side of the case.
const left = {
  instance: instance([q(2304 - 46), 0, 0], [q(46), q(768), q(4608)], 23, true),
  part: side,
};

describe("toParent / toLocal", () => {
  it("puts the right side's inside face (local face0, z = 0) at its +X surface", () => {
    // Origin of the local frame: z = 0 maps to x = max (23/32"), x = 0 to the bottom (z = 0).
    expect(toParent(right, [0, 0, 0])).toEqual([q(46), 0, 0]);
    // Far corner (L, W, T): top, front, outside face at x = 0.
    expect(toParent(right, [q(4608), q(768), q(46)])).toEqual([0, q(768), q(4608)]);
  });

  it("puts the mirrored left side's inside face (local face0) at its -X surface", () => {
    // Mirroring flips X (length) in definition space; orientation 23 sends local X down, so the
    // definition-space origin lands at the bottom, and z = 0 at the inner face x = 35-9/32".
    expect(toParent(left, [0, 0, 0])).toEqual([q(2304 - 46), 0, 0]);
    expect(toParent(left, [q(4608), q(768), q(46)])).toEqual([q(2304), q(768), q(4608)]);
  });

  it("is its own inverse", () => {
    for (const frame of [right, left]) {
      for (const point of [
        [0, 0, 0],
        [q(100), q(200), q(10)],
        [q(4608), q(768), q(46)],
      ] as const) {
        expect(toLocal(frame, toParent(frame, point))).toEqual([...point]);
      }
    }
  });

  it("gives matching definition-space coordinates at the same height on both sides", () => {
    // Height 14-1/4" (912/64"): the same definition-space x on both sides, so one cut list of
    // dados serves both instances.
    const height = q(912);
    expect(toLocal(right, [q(46), 0, height])[0]).toBe(height);
    expect(toLocal(left, [q(2304 - 46), 0, height])[0]).toBe(height);
  });
});

describe("contactOf", () => {
  const shelf = { min: [q(46), q(16), q(912)], max: [q(2304 - 46), q(768), q(912 + 46)] } as const;

  it("finds the patch where a shelf's end meets a side's inside face", () => {
    const c = contactOf({ min: [...shelf.min], max: [...shelf.max] }, boxOf(right.instance));
    expect(c).toEqual({
      kind: "touch",
      axis: 0,
      patch: { min: [q(46), q(16), q(912)], max: [q(46), q(768), q(912 + 46)] },
    });
  });

  it("recognises a corner overlap (dovetailed boards)", () => {
    const front = { min: [0, 0, 0], max: [q(640), q(32), q(256)] } as const;
    const sideA = { min: [0, 0, 0], max: [q(32), q(384), q(256)] } as const;
    const c = contactOf(
      { min: [...front.min], max: [...front.max] },
      { min: [...sideA.min], max: [...sideA.max] },
    );
    expect(c).toEqual({ kind: "overlap", region: { min: [0, 0, 0], max: [q(32), q(32), q(256)] } });
  });

  it("calls boxes that only share an edge, or nothing, apart", () => {
    const a = { min: [0, 0, 0], max: [10, 10, 10] } as const;
    expect(
      contactOf(
        { ...a, min: [...a.min], max: [...a.max] },
        { min: [10, 10, 0], max: [20, 20, 10] },
      ),
    ).toEqual({ kind: "apart" });
    expect(
      contactOf({ ...a, min: [...a.min], max: [...a.max] }, { min: [11, 0, 0], max: [20, 10, 10] }),
    ).toEqual({ kind: "apart" });
  });
});

describe("faceAt and boxToLocal", () => {
  it("names the face a plane coincides with", () => {
    expect(faceAt(right, 0, q(46))).toEqual({ axis: 2, side: 0 }); // x = 23/32" is the inside face0
    expect(faceAt(right, 0, 0)).toEqual({ axis: 2, side: 1 }); // x = 0 is the outside face1
    expect(faceAt(left, 0, q(2304 - 46))).toEqual({ axis: 2, side: 0 });
    expect(faceAt(right, 2, q(4608))).toEqual({ axis: 0, side: 1 }); // top end is end1
    expect(faceAt(right, 1, q(1))).toBeNull();
  });

  it("converts a contact patch to a definition-space box on face0", () => {
    const patch = {
      min: [q(46), q(16), q(912)] as const,
      max: [q(46), q(768), q(912 + 46)] as const,
    };
    const local = boxToLocal(right, { min: [...patch.min], max: [...patch.max] });
    expect(local).toEqual({ min: [q(912), q(16), 0], max: [q(912 + 46), q(768), 0] });
  });
});

// From the second M2 review: which way local Z points matters to where a region lands.
describe("assembly + geometry", () => {
  const part = {
    id: "p",
    name: "p",
    stock: "s",
    length: 10,
    width: 6,
    thickness: 2,
    grainLocked: true,
    ops: [],
  };
  const inst = (orientation: number, extent: [number, number, number]) => ({
    instance: {
      id: "i",
      def: "p",
      name: "i",
      position: { x: 0, y: 0, z: 0 },
      extent: { x: extent[0], y: extent[1], z: extent[2] },
      orientation,
      mirrored: false,
    },
    part,
  });
  it("[A6] a region's local z range is [0.5, 1.5] for an unrotated part", () => {
    const b = boxToLocal(inst(0, [10, 6, 2]), { min: [1, 1, 0.5], max: [3, 2, 1.5] });
    expect([b.min[2], b.max[2]]).toEqual([0.5, 1.5]);
  });
  it("[A5] and the same when local z points against the parent's x (orientation 17)", () => {
    const b = boxToLocal(inst(17, [2, 6, 10]), { min: [0.5, 1, 1], max: [1.5, 2, 3] });
    expect([b.min[2], b.max[2]]).toEqual([0.5, 1.5]);
  });
});
