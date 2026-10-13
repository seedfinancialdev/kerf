// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Random valid edits for property tests: parameter changes a user could make in the form.

import type { Project } from "@kerf/core";
import fc from "fast-check";
import { handMadeBookcase } from "./builders";
import { loadProject, withParam } from "./index";

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

/**
 * Each reference project, the hand-made one and the form, resized at random within its edit's
 * range: "every fixture" for an invariant that must hold whatever the project.
 */
export const resizedFixture: fc.Arbitrary<Project> = fc.oneof(
  bookcaseEdit.map((e) => applyBookcaseEdit(loadProject("bookcase"), e)),
  bookcaseEdit.map((e) => applyBookcaseEdit(loadProject("bookcase", "structure"), e)),
  boxEdit.map((e) => applyBoxEdit(loadProject("box"), e)),
  boxEdit.map((e) => applyBoxEdit(loadProject("box", "structure"), e)),
);

/** The bookcase built by hand with no joints yet (`handMadeBookcase`), resized at random. */
export const resizedHandMadeBookcase: fc.Arbitrary<Project> = bookcaseEdit.map((e) =>
  applyBookcaseEdit(handMadeBookcase(), e),
);

/** A right-angle orientation (ADR 003, 0-23) and whether the copy is mirrored (ADR 013, D2). */
export interface Turn {
  orientation: number;
  mirrored: boolean;
}

/** One turn for each of up to 16 saved boards, so every orientation and mirroring is reached. */
export const turns: fc.Arbitrary<Turn[]> = fc.array(
  fc.record({ orientation: fc.integer({ min: 0, max: 23 }), mirrored: fc.boolean() }),
  { minLength: 16, maxLength: 16 },
);

/** The project with its n-th saved board turned by `turns[n]`; generated boards are left alone. */
export function applyTurns(project: Project, list: readonly Turn[]): Project {
  return {
    ...project,
    instances: project.instances.map((i, n) => ({ ...i, ...list[n % list.length] })),
  };
}

/** A width in 1/64" grid steps, 12" to 96": every width a case's gap can be bound across. */
export const widthSixtyFourths: fc.Arbitrary<number> = fc.integer({ min: 12 * 64, max: 96 * 64 });

/** The spec's harness: 1,000 random valid edits per run. */
export const RUNS = 1000;
