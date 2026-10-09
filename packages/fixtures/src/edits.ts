// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Random valid edits for property tests: parameter changes a user could make in the form.

import type { Project } from "@kerf/core";
import fc from "fast-check";
import { withParam } from "./index";

/** Quarter-inch steps as a literal the expression grammar accepts: 36in, 36-1/4in, 36-1/2in. */
function quarterInches(quarters: number): string {
  const whole = Math.floor(quarters / 4);
  const rest = quarters % 4;
  if (rest === 0) return `${whole}in`;
  const frac = rest === 2 ? "1/2" : `${rest}/4`;
  return whole === 0 ? `${frac}in` : `${whole}-${frac}in`;
}

export interface BookcaseEdit {
  width: number; // quarter inches
  height: number;
  depth: number;
  shelfCount: number;
}

export const bookcaseEdit: fc.Arbitrary<BookcaseEdit> = fc.record({
  width: fc.integer({ min: 18 * 4, max: 48 * 4 }),
  height: fc.integer({ min: 36 * 4, max: 96 * 4 }),
  depth: fc.integer({ min: 8 * 4, max: 16 * 4 }),
  shelfCount: fc.integer({ min: 1, max: 8 }),
});

export function applyBookcaseEdit(project: Project, edit: BookcaseEdit): Project {
  let next = withParam(project, "width", quarterInches(edit.width));
  next = withParam(next, "height", quarterInches(edit.height));
  next = withParam(next, "depth", quarterInches(edit.depth));
  return withParam(next, "shelf_count", String(edit.shelfCount));
}

export interface BoxEdit {
  length: number; // quarter inches
  width: number;
  height: number;
}

export const boxEdit: fc.Arbitrary<BoxEdit> = fc.record({
  length: fc.integer({ min: 8 * 4, max: 16 * 4 }),
  width: fc.integer({ min: 5 * 4, max: 10 * 4 }),
  height: fc.integer({ min: 3 * 4, max: 6 * 4 }),
});

export function applyBoxEdit(project: Project, edit: BoxEdit): Project {
  let next = withParam(project, "box_length", quarterInches(edit.length));
  next = withParam(next, "box_width", quarterInches(edit.width));
  return withParam(next, "box_height", quarterInches(edit.height));
}

/** The spec's harness: 1,000 random valid edits per run. */
export const RUNS = 1000;
