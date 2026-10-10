// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Derived outputs. The spec defines their content (Operation specs, Cut list & nesting)
// but not their JSON shape; these shapes are the M0 contract the golden fixtures use.
// None of this is ever saved to .kerf.

import type { Rational } from "./rational";
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
  /** How many times this same problem occurred, when it was reported once for all of them. */
  count?: number;
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
  /** Set when parts merged into this line have different visible sizes; `visible` is the first's. */
  visibleVaries?: boolean;
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

/** A part placed on a sheet. `x` runs along the grain, `y` across it, from the sheet's corner. */
export interface Placement {
  x: Len;
  y: Len;
  /** Size along the grain and across it. */
  length: Len;
  width: Len;
  instance: Id;
  name: string;
  /** True when the part is turned 90 degrees from its length-along-grain orientation. */
  rotated: boolean;
  /** For a member of a continuous-grain run: its place in the run (1 of 4, 2 of 4...). */
  sequence?: { n: number; of: number };
}

export interface Offcut {
  x: Len;
  y: Len;
  length: Len;
  width: Len;
}

export interface SheetLayout {
  stock: Id;
  sheet: { length: Len; width: Len };
  /** Distinct part sizes on this sheet, in order of first placement. */
  contents: Array<{ length: Len; width: Len; quantity: number }>;
  /** Rips first, then crosscuts. */
  cutSequence: CutStep[];
  /** The largest usable offcut and how many of that size the sheet has. */
  largestOffcut: { alongGrain: Len; acrossGrain: Len; count: number };
  placements: Placement[];
  /** Every usable offcut (both sides at least the minimum useful size). */
  offcuts: Offcut[];
  /** Used area over sheet area. */
  efficiency: Rational;
}

/** A solid-stock board layout; only match-set boards are specified so far. */
export interface BoardLayout {
  stock: Id;
  matchSet?: Id;
  /** Parts joined end to end, plus kerfs and trim, cut from one board. */
  composite?: { length: Len; width: Len; widthAllowance: Len };
  minBoardLength?: Len;
  /** The standard length of the board the parts are cut from. */
  boardLength?: Len;
  /** Set only when several match sets are cut from one board: layouts with the same index share it. */
  boardIndex?: number;
  /** Other parts cut from the same board, after the match set. */
  alsoOnBoard?: Array<{ name: string; instance: Id }>;
  sequence: Array<{ sequence: number; of: number; name: string }>;
}

export interface NestingResult {
  sheets: SheetLayout[];
  boards: BoardLayout[];
  sheetCountByStock: Record<Id, number>;
}

export interface MachiningSetup {
  setup: number;
  tool: "dadoStack" | "router" | "handTools";
  /** Cut width for a dado stack or router straight bit. */
  width?: Len;
  depth?: Len;
  bit?: { type: "roundover"; radius: Len };
  cuts: number;
  /** The parts this setup cuts, and how many cuts each takes. */
  parts?: Array<{ name: string; cuts: number }>;
  /** True when the shop profile has no tool that can make these cuts (the tool named is the one needed). */
  missing?: boolean;
}

/** One distinct part shape, for the display mesh. Split definitions appear separately. */
export interface PartShape {
  /** The definition id, or `<id>~<n>` when cuts forced a split. */
  definition: Id;
  name: string;
  length: Len;
  width: Len;
  thickness: Len;
  /** Removals in definition space: joint cuts plus roundovers. */
  removals: RemovalPrimitive[];
}

export interface SolveResult {
  diagnostics: Diagnostic[];
  cutList: CutList;
  nesting: NestingResult;
  setups: MachiningSetup[];
  /** Distinct shapes with their removals. Empty when the project did not solve. */
  shapes: PartShape[];
  /**
   * True when any error exists (Operation specs: "Error blocks the solve"; Interaction spec: the
   * build plan cannot be exported). An error in the assembly also withholds the cut list, layouts
   * and setups; a layout or shop error leaves the cut list in place. Warnings and info never block.
   */
  blocked: boolean;
}

export interface BuildPlan {
  cutList: CutList;
  nesting: NestingResult;
  setups: MachiningSetup[];
  assemblyOrder: string[];
}
