// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The gap between two boards as an ordinary expression (ADR 015, rule 7), so a board drawn between
// them (Interaction spec, "Board": "its length binds to the gap") follows every resize without
// any change to the expression language. Built from the boards' own position and size expressions.

import type { Expr, Id, Instance, PartDef, Project } from "../types";
import { axisMaps } from "./assembly";
import { type SolvedInstance, solveModel } from "./model";

/**
 * The clear gap between two boards. `start` and `length` are expressions in project lengths over
 * parameters and stock, so a board that uses them follows any resize. `reason` is shop language.
 */
export type Gap =
  | { ok: true; axis: "x" | "y" | "z"; start: Expr; length: Expr }
  | { ok: false; reason: string };

const AXIS = ["x", "y", "z"] as const;
const PICK_TWO = "Pick two boards to measure between.";

/** The expression for a part's size along one of its own axes (0 length, 1 width, 2 thickness). */
function sizeExpr(project: Project, part: PartDef, local: 0 | 1 | 2): Expr {
  if (local === 0) return `(${part.length})`;
  if (local === 1) return `(${part.width})`;
  if (part.thickness !== undefined) return `(${part.thickness})`;
  const stock = project.stock.find((s) => s.id === part.stock);
  return `stock["${(stock?.name ?? "").replaceAll('"', '\\"')}"].thickness`;
}

/** The far face of `inst` along a project axis as an expression, or undefined if it has no part. */
function farFace(
  project: Project,
  inst: Instance,
  solved: SolvedInstance,
  axis: 0 | 1 | 2,
): Expr | undefined {
  const part = project.parts.find((d) => d.id === inst.def);
  const local = axisMaps(solved).findIndex((m) => m.axis === axis);
  if (!part || (local !== 0 && local !== 1 && local !== 2)) return undefined;
  return `(${inst.position[AXIS[axis]]}) + ${sizeExpr(project, part, local)}`;
}

const overlaps = (a: SolvedInstance, b: SolvedInstance, k: "x" | "y" | "z"): boolean =>
  a.position[k] < b.position[k] + b.extent[k] && b.position[k] < a.position[k] + a.extent[k];

/**
 * The clear gap between two placed boards (ADR 015, rule 7): where it starts and how long it is,
 * along the one axis on which they face each other, as expressions in project lengths.
 *
 * Refuses (`ok: false`, with a reason to show the user) when a board is missing, is a member of a
 * row (detach it first), or the boards touch, overlap, or do not face each other. Never throws of
 * its own accord; it relies on `solveModel` reporting problems as diagnostics rather than throwing.
 */
export function gapBetween(project: Project, a: Id, b: Id): Gap {
  const model = solveModel(project);
  const sa = model.instances.find((i) => i.id === a);
  const sb = model.instances.find((i) => i.id === b);
  if (!sa || !sb) return { ok: false, reason: PICK_TWO };
  for (const s of [sa, sb]) {
    if (s.pattern) {
      return {
        ok: false,
        reason: `${s.name} is one of a row; detach it first to measure from it.`,
      };
    }
  }
  const ia = project.instances.find((i) => i.id === a);
  const ib = project.instances.find((i) => i.id === b);
  if (!ia || !ib) return { ok: false, reason: PICK_TWO };

  for (const axis of [0, 1, 2] as const) {
    const k = AXIS[axis];
    const others = AXIS.filter((x) => x !== k);
    if (!others.every((o) => overlaps(sa, sb, o))) continue;
    const [low, lowSolved, high, highSolved] =
      sa.position[k] + sa.extent[k] <= sb.position[k] ? [ia, sa, ib, sb] : [ib, sb, ia, sa];
    // Boards that touch or overlap enclose no space, so there is no gap to bind to.
    if (lowSolved.position[k] + lowSolved.extent[k] >= highSolved.position[k]) continue;
    const end = farFace(project, low, lowSolved, axis);
    if (end === undefined) continue;
    return { ok: true, axis: k, start: `(${end})`, length: `(${high.position[k]}) - (${end})` };
  }
  return { ok: false, reason: `${sa.name} and ${sb.name} do not face each other across a gap.` };
}
