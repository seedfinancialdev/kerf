// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Finding which boxes touch which without comparing every pair. A joint between two patterns
// would otherwise cost hosts x guests; with a sweep along the axis the boxes are spread over most,
// the cost follows the pairs that actually touch.

import type { Box } from "../solve/assembly";

/** Boxes that share any point, boundaries included: touching and overlapping both count. */
function touches(a: Box, b: Box): boolean {
  for (const k of [0, 1, 2] as const) {
    if (Math.max(a.min[k], b.min[k]) > Math.min(a.max[k], b.max[k])) return false;
  }
  return true;
}

/** The axis along which the boxes are most spread out relative to their own size. */
function sweepAxis(boxes: Box[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  let bestRatio = -1;
  for (const k of [0, 1, 2] as const) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let total = 0;
    for (const b of boxes) {
      lo = Math.min(lo, b.min[k]);
      hi = Math.max(hi, b.max[k]);
      total += b.max[k] - b.min[k];
    }
    const average = total / Math.max(boxes.length, 1) || 1;
    const ratio = (hi - lo) / average;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = k;
    }
  }
  return best;
}

interface Item {
  set: 0 | 1;
  index: number;
  lo: number;
  hi: number;
}

/**
 * Every (a, b) with `a[i]` touching `b[j]`, ordered by i then j. Equivalent to testing all pairs.
 * With a `limit`, the search stops as soon as more than `limit` pairs are found, and what is
 * returned has more than `limit` entries so the caller can tell; it is not the full list then.
 */
export function touchingPairs(
  a: Box[],
  b: Box[],
  limit = Number.POSITIVE_INFINITY,
): Array<[number, number]> {
  if (a.length === 0 || b.length === 0) return [];
  if (a.length * b.length <= 256) {
    const out: Array<[number, number]> = [];
    for (const [i, boxA] of a.entries()) {
      for (const [j, boxB] of b.entries()) if (touches(boxA, boxB)) out.push([i, j]);
    }
    return out;
  }

  const axis = sweepAxis([...a, ...b]);
  const items: Item[] = [
    ...a.map((box, index): Item => ({ set: 0, index, lo: box.min[axis], hi: box.max[axis] })),
    ...b.map((box, index): Item => ({ set: 1, index, lo: box.min[axis], hi: box.max[axis] })),
  ];
  items.sort((x, y) => x.lo - y.lo || x.set - y.set || x.index - y.index);

  const out: Array<[number, number]> = [];
  let activeA: Item[] = [];
  let activeB: Item[] = [];
  for (const item of items) {
    activeA = activeA.filter((x) => x.hi >= item.lo);
    activeB = activeB.filter((x) => x.hi >= item.lo);
    if (item.set === 0) {
      const boxA = a[item.index] as Box;
      for (const other of activeB) {
        if (touches(boxA, b[other.index] as Box)) out.push([item.index, other.index]);
        if (out.length > limit) return out;
      }
      activeA.push(item);
    } else {
      const boxB = b[item.index] as Box;
      for (const other of activeA) {
        if (touches(a[other.index] as Box, boxB)) out.push([other.index, item.index]);
        if (out.length > limit) return out;
      }
      activeB.push(item);
    }
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/**
 * Every pair (i, j), i < j, of boxes in one list that share any point, ordered by i then j. Swept
 * along the axis the boxes are most spread over, so a project with thousands of parts is fast.
 * `limit` works as in `touchingPairs`.
 */
export function selfTouchingPairs(
  boxes: Box[],
  limit = Number.POSITIVE_INFINITY,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (boxes.length < 2) return out;
  if (boxes.length <= 16) {
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (touches(boxes[i] as Box, boxes[j] as Box)) out.push([i, j]);
      }
    }
    return out;
  }

  const axis = sweepAxis(boxes);
  const order = boxes
    .map((box, index) => ({ index, lo: box.min[axis], hi: box.max[axis] }))
    .sort((x, y) => x.lo - y.lo || x.index - y.index);
  let active: typeof order = [];
  for (const item of order) {
    active = active.filter((x) => x.hi >= item.lo);
    const box = boxes[item.index] as Box;
    for (const other of active) {
      if (!touches(boxes[other.index] as Box, box)) continue;
      out.push(other.index < item.index ? [other.index, item.index] : [item.index, other.index]);
      if (out.length > limit) return out;
    }
    active.push(item);
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}
