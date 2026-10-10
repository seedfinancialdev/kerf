// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Derived outputs. The spec defines their content (Operation specs, Cut list & nesting)
// but not their JSON shape; these shapes are the M0 contract the golden fixtures use.
// None of this is ever saved to .kerf.

import type { EdgeRef, Id, Len } from "./types";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  rule: string;
  /** Shop-language message shown in the UI. */
  message: string;
  part?: Id;
  joint?: Id;
  /** The field the problem is on, e.g. a parameter name or "Side length". */
  field?: string;
}

export type Vec3 = readonly [Len, Len, Len];

/**
 * A removal in a part's local frame (ADR 013, decision D3). Local X is the length, Y the width
 * and Z the thickness; every coordinate is an integer in internal units.
 *
 * - `box`: an axis-aligned block between `min` and `max` (dado, groove, rabbet).
 * - `trapezoidPrism`: a four-point profile in the named plane, extruded over `range` along the
 *   third axis (dovetail tails and sockets).
 * - `quarterRoundSweep`: the quarter-round removed along an edge (roundover).
 */
export type RemovalPrimitive =
  | { kind: "box"; min: Vec3; max: Vec3 }
  | {
      kind: "trapezoidPrism";
      plane: "xy" | "xz" | "yz";
      points: ReadonlyArray<readonly [Len, Len]>;
      range: readonly [Len, Len];
    }
  | { kind: "quarterRoundSweep"; edge: EdgeRef; radius: Len };

export interface DovetailLayoutInput {
  boardWidth: Len;
  tails: number;
  pin: Len;
  matingThickness: Len;
  /** Slope denominator: 8 for 1:8. */
  slope: number;
}

export interface DovetailLayout {
  wideTailWidth: Len;
  slopeOffset: Len;
  narrowTailWidth: Len;
}

export interface CutListPart {
  name: string;
  quantity: number;
}

export interface CutListLine {
  stock: Id;
  /** Cut size (shoulder-to-shoulder plus joint penetration). */
  length: Len;
  width: Len;
  thickness: Len;
  /** Visible size between joints, shown beside the cut size. */
  visible: { length: Len; width: Len };
  quantity: number;
  parts: CutListPart[];
}

export interface CutListBlockMember {
  sequence: number;
  of: number;
  name: string;
  stock: Id;
  length: Len;
  width: Len;
  thickness: Len;
}

export interface CutListBlock {
  matchSet: Id;
  name: string;
  members: CutListBlockMember[];
}

export interface CutList {
  lines: CutListLine[];
  blocks: CutListBlock[];
}

export interface CutStep {
  op: "rip" | "crosscut";
  /** Strip widths for a rip, cut lengths for a crosscut, in order. */
  sizes: Len[];
}

export interface SheetLayout {
  stock: Id;
  sheet: { length: Len; width: Len };
  contents: Array<{ length: Len; width: Len; quantity: number }>;
  cutSequence: CutStep[];
  largestOffcut: { alongGrain: Len; acrossGrain: Len; count: number };
}

/** A solid-stock board layout; only match-set boards are specified so far. */
export interface BoardLayout {
  stock: Id;
  matchSet?: Id;
  /** Parts joined end to end, plus kerfs and trim, cut from one board. */
  composite?: { length: Len; width: Len; widthAllowance: Len };
  minBoardLength?: Len;
  sequence: Array<{ sequence: number; of: number; name: string }>;
}

export interface NestingResult {
  sheets: SheetLayout[];
  boards: BoardLayout[];
  sheetCountByStock: Record<Id, number>;
}

export interface MachiningSetup {
  setup: number;
  tool: "dadoStack" | "router";
  /** Cut width for a dado stack, bit radius for a roundover bit. */
  width?: Len;
  depth?: Len;
  bit?: { type: "roundover"; radius: Len };
  cuts: number;
}

export interface SolveResult {
  diagnostics: Diagnostic[];
  cutList: CutList;
  nesting: NestingResult;
  setups: MachiningSetup[];
}

export interface BuildPlan {
  cutList: CutList;
  nesting: NestingResult;
  setups: MachiningSetup[];
  assemblyOrder: string[];
}
