// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// M0: every core function is a typed stub that throws NotImplemented.
// Function names and signatures are the M0 contract; the spec defines behaviour, not an API.

import { notImplemented } from "./errors";
import { deriveJoints } from "./joints/derive";
import type { CutAdd } from "./joints/types";
import { nestProject } from "./nest";
import type {
  CutList,
  MachiningSetup,
  NestingResult,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import { buildSetups } from "./outputs/machining";
import { runPipeline, solveProject } from "./pipeline";
import type { Id, PartDef, Project, ShopProfile } from "./types";

// The whole pipeline (steps 1-6).

export function solve(project: Project, shop: ShopProfile): SolveResult {
  return solveProject(project, shop);
}

// Joinery (M2)

/**
 * What one joint does to its host and guest: removals in each part's definition space, and what it
 * adds to the guest's cut size. For a joint with a pattern on either side, `host`/`guest` collect
 * the removals of every pair and `guestCutAdd` is the add for one guest.
 */
export function deriveJointCuts(
  project: Project,
  jointId: Id,
): { host: RemovalPrimitive[]; guest: RemovalPrimitive[]; guestCutAdd: CutAdd } {
  const p = runPipeline(project);
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

// Outputs (M2)

export function buildCutList(project: Project): CutList {
  return runPipeline(project).cutList;
}

export function nest(project: Project, shop: ShopProfile): NestingResult {
  const p = runPipeline(project);
  return nestProject(project, p.parts, shop).result;
}

export function machiningSetups(project: Project, shop: ShopProfile): MachiningSetup[] {
  const p = runPipeline(project);
  return buildSetups(project, p.parts, p.derived, shop);
}

// Structures (M3)

export function generateStructures(_project: Project, _shop: ShopProfile): Project {
  return notImplemented("generateStructures");
}

export function detachPart(_project: Project, _part: Id): PartDef {
  return notImplemented("detachPart");
}

export { deriveJoints };
