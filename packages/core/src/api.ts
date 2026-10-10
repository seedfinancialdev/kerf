// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The core API. Functions here are thin wrappers over the pipeline in pipeline.ts; structures
// (M3) are still typed stubs that throw NotImplemented.

import { deriveJoints } from "./joints/derive";
import type { CutAdd } from "./joints/types";
import type {
  CutList,
  MachiningSetup,
  NestingResult,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import { runPipeline, solveProject } from "./pipeline";
import { detachedPart, generate } from "./structures";
import type { Id, PartDef, Project, ShopProfile } from "./types";

// The whole pipeline (steps 1-6).

export function solve(project: Project, shop: ShopProfile): SolveResult {
  return solveProject(project, shop);
}

// Joinery (M2)

/**
 * What one joint does to its host and guest: removals in each part's definition space, and what it
 * adds to the guest's cut size. For a joint with a pattern on either side, `host`/`guest` collect
 * the removals of every pair and `guestCutAdd` is the add for the first derived pair.
 * Throws RangeError for a joint id the project does not have, and Error for a project that is not
 * valid; a joint that failed has no cuts and its reasons are in `solve(...).diagnostics`.
 */
export function deriveJointCuts(
  project: Project,
  jointId: Id,
): { host: RemovalPrimitive[]; guest: RemovalPrimitive[]; guestCutAdd: CutAdd } {
  const p = runPipeline(project);
  if (!p.project) {
    const why = p.diagnostics.find((d) => d.severity === "error")?.message;
    throw new Error(`The project is not valid${why ? `: ${why}` : "."}`);
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

export function buildCutList(project: Project): CutList {
  return runPipeline(project).cutList;
}

export function nest(project: Project, shop: ShopProfile): NestingResult {
  return solveProject(project, shop).nesting;
}

export function machiningSetups(project: Project, shop: ShopProfile): MachiningSetup[] {
  return solveProject(project, shop).setups;
}

// Structures (M3)

/**
 * The project with everything its structures generate. Pure and deterministic: ids come from the
 * structure and the part's role, so generating twice gives the same project. A detached part is
 * kept exactly as saved. Joint choice follows the shop only through the machining setups (which
 * name the tool you would need), so the shop does not change what is generated.
 */
export function generateStructures(project: Project, _shop: ShopProfile): Project {
  return generate(project).project;
}

/**
 * The generated part as detached: only this part, with its role kept so the inspector can say where
 * it came from. Throws RangeError for a part that does not exist or was not generated.
 */
export function detachPart(project: Project, part: Id): PartDef {
  return detachedPart(project, part);
}

export { deriveJoints };
