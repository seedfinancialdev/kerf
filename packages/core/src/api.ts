// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The core API: the functions an application calls. Each is a short front for the pipeline in
// pipeline.ts or for the structure generators, with the contract a caller needs spelled out.

import type { CutAdd } from "./joints/types";
import type {
  CutList,
  Diagnostic,
  MachiningSetup,
  NestingResult,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import { runPipeline, solveProject } from "./pipeline";
import { ProjectFormatError, validateProject } from "./project-file";
import { shopProblem } from "./shop";
import { detachedPart, generateFrom } from "./structures";
import type { Id, PartDef, Project, ShopProfile } from "./types";

/**
 * Solves the whole project: structures, parameters, parts, joints, validation, then cut list,
 * layouts and setups. Never throws: anything that goes wrong is a diagnostic, and `blocked` says
 * whether an error stops the outputs. The project and the shop profile are read once and not
 * changed.
 */
export function solve(project: Project, shop: ShopProfile): SolveResult {
  return solveProject(project, shop);
}

// Joinery (M2)

/**
 * What one joint does to its host and guest: removals in each part's definition space, and what it
 * adds to the guest's cut size. For a joint with a pattern on either side, `host`/`guest` collect
 * the removals of every pair and `guestCutAdd` is the add for the first derived pair.
 * Throws RangeError for a joint id the project does not have, and ProjectFormatError for a
 * project that is not valid; a joint that failed has no cuts and its reasons are in
 * `solve(...).diagnostics`.
 */
export function deriveJointCuts(
  project: Project,
  jointId: Id,
): { host: RemovalPrimitive[]; guest: RemovalPrimitive[]; guestCutAdd: CutAdd } {
  const p = runPipeline(project);
  if (!p.project) {
    const checked = validateProject(project);
    if (checked.problem) throw checked.problem;
    throw new ProjectFormatError("$", "the project could not be solved; see solve() for why");
  }
  if (!p.project.joints.some((j) => j.id === jointId)) {
    throw new RangeError(`The project has no joint "${jointId}".`);
  }
  const pairs = p.derived.pairs.filter((pair) => pair.joint === jointId);
  const key = (r: RemovalPrimitive): string => JSON.stringify(r);
  const order = (a: RemovalPrimitive, b: RemovalPrimitive): number =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  return {
    host: pairs.flatMap((pair) => pair.hostCuts).sort(order),
    guest: pairs.flatMap((pair) => pair.guestCuts).sort(order),
    guestCutAdd: pairs[0]?.guestAdd ?? { length: 0, width: 0 },
  };
}

// Outputs (M2). These return the output only; `solve` is the way to see why one is empty
// (an invalid project, an error in the assembly, an invalid shop profile).

/** The cut list alone: empty when an error in the assembly means the project cannot be built. */
export function buildCutList(project: Project): CutList {
  return runPipeline(project).cutList;
}

/** Sheet layouts, board layouts and totals, as `solve` gives them (empty when blocked). */
export function nest(project: Project, shop: ShopProfile): NestingResult {
  return solveProject(project, shop).nesting;
}

/** Machining grouped by identical tool setup, as `solve` gives it (empty when blocked). */
export function machiningSetups(project: Project, shop: ShopProfile): MachiningSetup[] {
  return solveProject(project, shop).setups;
}

// Structures (M3)

/**
 * The project with everything its structures generate. Pure and deterministic: ids come from the
 * structure and the part's role, so generating twice gives the same project. A detached part is
 * kept exactly as saved. The shop matters in one way: a `"auto"` roundover takes the largest bit
 * the shop owns that fits the board. (Which tool a joint needs is told by `machiningSetups`.)
 */
export function generateStructures(project: Project, shop: ShopProfile): Project {
  return generateStructuresChecked(project, shop).project;
}

/**
 * The same, with what the generators found: a missing stock, an option of the wrong type, a board
 * edited by hand that the form no longer places. Throws ProjectFormatError for a project that is
 * not valid (it is checked first, so a bad object never reaches the generators).
 */
export function generateStructuresChecked(
  project: Project,
  shop: ShopProfile,
): { project: Project; diagnostics: Diagnostic[] } {
  // The shop is checked like any input; an invalid one is said and generation goes on without it.
  const shopIssue = shopProblem(shop);
  const generated = generateFrom(project, shopIssue ? undefined : shop);
  if (!generated.ok) throw generated.problem;
  return {
    project: generated.project,
    diagnostics: shopIssue ? [shopIssue, ...generated.diagnostics] : generated.diagnostics,
  };
}

/**
 * The generated part as detached: only this part, with its role kept so the inspector can say where
 * it came from. Throws RangeError for a part that does not exist or was not generated.
 */
export function detachPart(project: Project, part: Id): PartDef {
  return detachedPart(project, part);
}

// Build plan (M4)

/**
 * The Join tool's proposal for two placed boards (ADR 015, rule 6): the joint and the tool, or the
 * reason there is none. Pure; `jointId` is supplied by the caller. Never throws. A board thinner
 * than the one that would sit in it (resolved thickness, a part's own override included) is never
 * cut into; the reason says to glue or nail it.
 */
export { type JointProposal, proposeJoint } from "./joints/propose";
/**
 * The order to put each structure together, written from its form: dry-fit, glue, square, and
 * for a case the back last. Each step names the placed boards it touches. Empty for a project
 * with no structure or one that cannot be solved. Never throws; the project and the shop profile
 * are not changed.
 */
export { assemblyOrder } from "./outputs/assembly-order";

/**
 * The clear gap between two placed boards as expressions (ADR 015, rule 7): where it starts and how
 * long it is, along the one axis on which they face each other. Never throws.
 */
export { type Gap, gapBetween } from "./solve/gap";

/**
 * The orientation index (0-23, ADR 003) whose length axis and width axis are the two given signed
 * unit axes of the parent frame. Throws RangeError when they are not two different axes at right angles.
 */
export { orientationFor } from "./solve/orientation";
