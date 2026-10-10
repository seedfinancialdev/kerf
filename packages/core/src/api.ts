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
  Rational,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import type { Id, Len, PartDef, Project, ShopProfile } from "./types";

// Units & expressions (M1)

export type UnitSystem = Project["units"];

export function parseLength(_source: string, _units: UnitSystem): Len {
  return notImplemented("parseLength");
}

export function formatLength(_len: Len, _units: UnitSystem): string {
  return notImplemented("formatLength");
}

export function snapToGrid(_value: Rational, _units: UnitSystem): Len {
  return notImplemented("snapToGrid");
}

export type ExprScope = Record<string, unknown>;

export function evaluateExpression(_source: string, _scope: ExprScope): Rational {
  return notImplemented("evaluateExpression");
}

// Project file (M1)

/** Canonical JSON: fixed key order, so load → save is byte-identical. */
export function serializeProject(_project: Project): string {
  return notImplemented("serializeProject");
}

export function parseProject(_json: string): Project {
  return notImplemented("parseProject");
}

// Solve pipeline (M1–M2)

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
