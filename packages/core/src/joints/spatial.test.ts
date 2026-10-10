// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Box } from "../solve/assembly";
import { selfTouchingPairs, touchingPairs } from "./spatial";

const box = (x: number, y: number, z: number, w: number): Box => ({
  min: [x, y, z],
  max: [x + w, y + w, z + w],
});

function brute(a: Box[], b: Box[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [i, p] of a.entries()) {
    for (const [j, q] of b.entries()) {
      const apart = [0, 1, 2].some(
        (k) => Math.max(p.min[k] ?? 0, q.min[k] ?? 0) > Math.min(p.max[k] ?? 0, q.max[k] ?? 0),
      );
      if (!apart) out.push([i, j]);
    }
  }
  return out;
}

describe("touchingPairs", () => {
  it("includes boxes that only share a face, and excludes boxes with a gap", () => {
    const pairs = touchingPairs([box(0, 0, 0, 10)], [box(10, 0, 0, 5), box(11, 0, 0, 5)]);
    expect(pairs).toEqual([[0, 0]]);
  });

  it("returns nothing for empty inputs", () => {
    expect(touchingPairs([], [box(0, 0, 0, 1)])).toEqual([]);
  });

  it("finds the same pairs as testing every pair, for large sets", () => {
    const row = (n: number, offset: number): Box[] =>
      Array.from({ length: n }, (_, i) => box(0, i * 10 + offset, 0, 10));
    const a = row(400, 0);
    const b = row(400, 5);
    expect(touchingPairs(a, b)).toEqual(brute(a, b));
  });

  it("matches the brute-force answer on random boxes", () => {
    const arb = fc.array(
      fc.record({
        x: fc.integer({ min: 0, max: 60 }),
        y: fc.integer({ min: 0, max: 60 }),
        z: fc.integer({ min: 0, max: 60 }),
        w: fc.integer({ min: 1, max: 15 }),
      }),
      // At least 17 each, so 17 x 17 > 256 candidate pairs and the sweep (not the small-set loop)
      // always runs.
      { minLength: 17, maxLength: 60 },
    );
    fc.assert(
      fc.property(arb, arb, (as, bs) => {
        const a = as.map((r) => box(r.x, r.y, r.z, r.w));
        const b = bs.map((r) => box(r.x, r.y, r.z, r.w));
        expect(touchingPairs(a, b)).toEqual(brute(a, b));
      }),
      { numRuns: 200 },
    );
  });

  it("stays fast when a thousand boxes meet a thousand others", () => {
    const row = (n: number, offset: number): Box[] =>
      Array.from({ length: n }, (_, i) => box(0, i * 10 + offset, 0, 10));
    const started = Date.now();
    touchingPairs(row(1000, 0), row(1000, 1));
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// From the second M2 review: the sweep path (more than 256 candidate pairs) must agree with
// the all-pairs test, boundaries included.
describe("touchingPairs (sweep path)", () => {
  it("touching boxes are found by the sweep (400 pairs tested): faces shared along x", () => {
    const cube = (x: number): { min: [number, number, number]; max: [number, number, number] } => ({
      min: [x, 0, 0],
      max: [x + 10, 10, 10],
    });
    const a = Array.from({ length: 20 }, (_, i) => cube(20 * i));
    const b = Array.from({ length: 20 }, (_, i) => cube(20 * i + 10));
    const expected: Array<[number, number]> = [];
    for (let i = 0; i < 20; i += 1) {
      expected.push([i, i]);
      if (i + 1 < 20) expected.push([i + 1, i]);
    }
    expected.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(touchingPairs(a, b)).toEqual(expected);
  });
  it("the sweep returns pairs ordered by i then j even when the boxes are listed backwards", () => {
    const cube = (x: number): { min: [number, number, number]; max: [number, number, number] } => ({
      min: [x, 0, 0],
      max: [x + 10, 10, 10],
    });
    const a = Array.from({ length: 20 }, (_, i) => cube(20 * (19 - i)));
    const b = Array.from({ length: 20 }, (_, i) => cube(20 * i + 10));
    const out = touchingPairs(a, b);
    const sorted = [...out].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(out).toEqual(sorted);
    expect(out).toHaveLength(39);
  });
});

describe("selfTouchingPairs", () => {
  const bruteSelf = (boxes: Box[]): Array<[number, number]> =>
    brute(boxes, boxes).filter(([i, j]) => i < j);

  it("finds the same pairs as testing every pair, above and below the sweep threshold", () => {
    const arb = fc.array(
      fc.record({
        x: fc.integer({ min: 0, max: 60 }),
        y: fc.integer({ min: 0, max: 60 }),
        z: fc.integer({ min: 0, max: 60 }),
        w: fc.integer({ min: 1, max: 15 }),
      }),
      { minLength: 0, maxLength: 80 },
    );
    fc.assert(
      fc.property(arb, (rs) => {
        const boxes = rs.map((r) => box(r.x, r.y, r.z, r.w));
        expect(selfTouchingPairs(boxes)).toEqual(bruteSelf(boxes));
      }),
      { numRuns: 200 },
    );
  });

  it("stops once more than `limit` pairs are found, and says so by returning more than the limit", () => {
    const stacked = Array.from({ length: 40 }, () => box(0, 0, 0, 10)); // every pair overlaps
    expect(selfTouchingPairs(stacked)).toHaveLength((40 * 39) / 2);
    const capped = selfTouchingPairs(stacked, 100);
    expect(capped.length).toBeGreaterThan(100);
    expect(capped.length).toBeLessThan((40 * 39) / 2);
  });

  it("counts only the pairs the predicate accepts toward the limit", () => {
    // 40 boxes in a row that only touch at faces; accept none: nothing found, limit never hit.
    const row = Array.from({ length: 40 }, (_, i) => box(i * 10, 0, 0, 10));
    expect(selfTouchingPairs(row, 5, () => false)).toEqual([]);
    expect(selfTouchingPairs(row, 5, () => true).length).toBeGreaterThan(5);
  });

  it("limits touchingPairs the same way", () => {
    const a = Array.from({ length: 30 }, () => box(0, 0, 0, 10));
    const b = Array.from({ length: 30 }, () => box(0, 0, 0, 10));
    const capped = touchingPairs(a, b, 50);
    expect(capped.length).toBeGreaterThan(50);
    expect(capped.length).toBeLessThan(900);
  });
});
