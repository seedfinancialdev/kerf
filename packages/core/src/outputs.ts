// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Derived outputs. The spec defines their content (Operation specs, Cut list & nesting)
// but not their JSON shape; these shapes are the M0 contract the golden fixtures use.
// None of this is ever saved to .kerf.

import type { Rational } from "./rational";
import type { RuleId } from "./rules";
import type { EdgeRef, Id, Len } from "./types";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  rule: RuleId;
  /** Shop-language message shown in the UI. */
  message: string;
  part?: Id;
  joint?: Id;
  /**
   * What the problem is on, in the user's words: a board or stock name ("Shelf"), a setting
   * ("the number of bays"), or a field of a part ("Side length").
   */
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
  /**
   * Strip rips first, then the crosscuts (one per distinct strip pattern), then one step per
   * distinct composite blank that divides it into members (a crosscut, or a rip when the members
   * lie side by side).
   */
  cutSequence: CutStep[];
  /** The largest usable offcut and how many of that size the sheet has. */
  largestOffcut: { alongGrain: Len; acrossGrain: Len; count: number };
  placements: Placement[];
  /** Every usable offcut (both sides at least the minimum useful size). */
  offcuts: Offcut[];
  /** Used area over sheet area. */
  efficiency: Rational;
}

/** What every board bought has: its stock, the standard length it is cut from, and what it holds. */
interface BoardLayoutBase {
  stock: Id;
  /** The standard length of the board the parts are cut from. */
  boardLength: Len;
  sequence: Array<{ sequence: number; of: number; name: string }>;
}

/** A board holding ordinary parts, packed first-fit by length. */
export interface PlainBoardLayout extends BoardLayoutBase {
  matchSet?: undefined;
}

/** A board a match set is cut from, as one composite blank, with other parts around it. */
export interface MatchSetBoardLayout extends BoardLayoutBase {
  matchSet: Id;
  /**
   * The blank the set is cut from: members end to end (or side by side for axis "width", or the
   * largest member's length and width for a bookmatch), plus kerfs and end trim.
   */
  composite: { length: Len; width: Len; widthAllowance: Len };
  /** The shortest standard board that holds the blank, in whole inches. */
  minBoardLength: Len;
  /** A bookmatch only: thickness of the resawn board (parts, saw gap and planing allowance). */
  compositeThickness?: Len;
  /**
   * Set only when several match sets are cut from one board: layouts of the same stock with the
   * same index share it. The index counts boards within one stock.
   */
  boardIndex?: number;
  /** Other parts cut from the same board, after the match set. */
  alsoOnBoard?: Array<{ name: string; instance: Id }>;
}

/** A solid-stock board layout: one per board bought, or one per match set cut from a board. */
export type BoardLayout = PlainBoardLayout | MatchSetBoardLayout;

/** The layout as a match set's board, or undefined for a board of ordinary parts. */
export function matchSetBoard(layout: BoardLayout | undefined): MatchSetBoardLayout | undefined {
  return layout?.matchSet === undefined ? undefined : layout;
}

/**
 * What one stock adds up to (Cut list & nesting, "Outputs"). Sheet goods carry `sheets`; solid
 * stock carries `boards` bought, `boardFeet` of rough parts (rough length x rough width x the
 * thickness rounded up to a quarter inch, over 144) and `linearFeet` of boards bought.
 */
export interface StockTotals {
  stock: Id;
  sheets?: number;
  boards?: number;
  boardFeet?: Rational;
  linearFeet?: Rational;
}

export interface NestingResult {
  sheets: SheetLayout[];
  boards: BoardLayout[];
  sheetCountByStock: Record<Id, number>;
  /** One entry per stock that has parts, in project stock order. */
  totals: StockTotals[];
}

/** What every machining setup has: its number, how many cuts it makes and on which parts. */
interface SetupBase {
  setup: number;
  cuts: number;
  /** The parts this setup cuts, and how many cuts each takes. */
  parts: Array<{ name: string; cuts: number }>;
  /** True when the shop profile has no tool that can make these cuts (the tool named is the one needed). */
  missing?: boolean;
}

/** Dados, grooves and rabbets: one cut width and depth, on a dado stack or a router. */
export interface CutSetup extends SetupBase {
  tool: "dadoStack" | "router";
  width: Len;
  depth: Len;
  bit?: undefined;
}

/** An edge profile: every edge rounded with one bit. */
export interface ProfileSetup extends SetupBase {
  tool: "router";
  bit: { type: "roundover"; radius: Len };
  width?: undefined;
  depth?: undefined;
}

/** Hand-cut joints (dovetails): no machine setting to speak of. */
export interface HandToolSetup extends SetupBase {
  tool: "handTools";
  width?: undefined;
  depth?: undefined;
  bit?: undefined;
}

export type MachiningSetup = CutSetup | ProfileSetup | HandToolSetup;

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

/**
 * Where one placed copy of a board sits (ADR 015, rule 8). Reported whenever the boards can be
 * placed, even when an assembly error withholds the shapes, so a viewer can still draw them.
 */
export interface PlacedPart {
  /** The placed copy: an instance id, or `<patternId>:<index>` for a member of a row. */
  instance: Id;
  /** The shape it is drawn with: a `PartShape.definition`. */
  shape: Id;
  /** The part definition it is a copy of. */
  part: Id;
  name: string;
  /** The finished blank, before any cut. */
  size: { length: Len; width: Len; thickness: Len };
  /** Its bounding box in the project frame. */
  box: { min: Vec3; max: Vec3 };
  /**
   * Where the shape's local origin lands and where its length (x), width (y) and thickness (z)
   * point in the project frame, each a signed unit axis: the point (u, v, w) of the shape sits at
   * origin + u·x + v·y + w·z. A mirrored copy has its x reversed and its origin at the other end.
   */
  frame: { origin: Vec3; x: Vec3; y: Vec3; z: Vec3 };
  /** The structure and role that made it; absent for a board made by hand. */
  source?: { structure: Id; role: string };
  /** True when a board a form made was taken over by hand. */
  detached: boolean;
  /** For a member of a row: the row and its index. */
  pattern?: { id: Id; index: number };
}

export interface SolveResult {
  diagnostics: Diagnostic[];
  cutList: CutList;
  nesting: NestingResult;
  setups: MachiningSetup[];
  /**
   * Distinct shapes with their removals. Empty when an error in the assembly (steps 1-5) means
   * the parts cannot be built; a layout or shop-profile error does not empty it.
   */
  shapes: PartShape[];
  /** Every placed copy (ADR 015, rule 8). Empty only when the project itself is invalid. */
  placements: PlacedPart[];
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
