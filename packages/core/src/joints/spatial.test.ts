// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Box } from "../solve/assembly";
import { touchingPairs } from "./spatial";

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
      { minLength: 0, maxLength: 40 },
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
