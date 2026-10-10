// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// M0: every core function is a typed stub that throws NotImplemented.
// Function names and signatures are the M0 contract; the spec defines behaviour, not an API.

import { notImplemented } from "./errors";
import type {
  CutList,
  DovetailLayout,
  DovetailLayoutInput,
  MachiningSetup,
  NestingResult,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import type { Id, Len, PartDef, Project, ShopProfile } from "./types";

// Solve pipeline (M2; steps 1-3 are solveModel)

export function solve(_project: Project, _shop: ShopProfile): SolveResult {
  return notImplemented("solve");
}

// Joinery (M2)

export function dovetailLayout(_input: DovetailLayoutInput): DovetailLayout {
  return notImplemented("dovetailLayout");
}

export function deriveJointCuts(
  _project: Project,
  _jointId: Id,
): {
  host: RemovalPrimitive[];
  guest: RemovalPrimitive[];
  guestCutAdd: { length: Len; width: Len };
} {
  return notImplemented("deriveJointCuts");
}

// Outputs (M2)

export function buildCutList(_project: Project): CutList {
  return notImplemented("buildCutList");
}

export function nest(_project: Project, _shop: ShopProfile): NestingResult {
  return notImplemented("nest");
}

export function machiningSetups(_project: Project, _shop: ShopProfile): MachiningSetup[] {
  return notImplemented("machiningSetups");
}

// Structures (M3)

export function generateStructures(_project: Project, _shop: ShopProfile): Project {
  return notImplemented("generateStructures");
}

export function detachPart(_project: Project, _part: Id): PartDef {
  return notImplemented("detachPart");
}
