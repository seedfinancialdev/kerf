// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Derived outputs. The spec defines their content (Operation specs, Cut list & nesting)
// but not their JSON shape; these shapes are the M0 contract the golden fixtures use.
// None of this is ever saved to .kerf.

import type { Id, Len } from "./types";

/** Exact rational used during expression evaluation; snapped to the grid once, at the end. */
export interface Rational {
  num: bigint;
  den: bigint;
}

export interface Diagnostic {
  severity: "error" | "warning";
  rule: string;
  /** Shop-language message shown in the UI. */
  message: string;
  part?: Id;
}

/** SPEC-GAP: the spec names these primitives but does not define their fields. */
export type RemovalPrimitive =
  | { kind: "box"; min: [Len, Len, Len]; max: [Len, Len, Len] }
  | { kind: "trapezoidPrism"; points: Array<[Len, Len]>; thickness: Len }
  | { kind: "quarterRoundSweep"; radius: Len; edge: string };

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
  text: string;
}

export interface SheetLayout {
  stock: Id;
  sheet: { length: Len; width: Len };
  contents: Array<{ length: Len; width: Len; quantity: number }>;
  cutSequence: CutStep[];
  largestOffcut: { alongGrain: Len; acrossGrain: Len; count: number };
}

export interface NestingResult {
  sheets: SheetLayout[];
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
