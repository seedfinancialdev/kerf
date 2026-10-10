// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model v0 (docs/spec/01-domain-model-v0.md), translated as written.
// Lengths are integers in internal units (see units.ts); expressions are strings.

export type Id = string; // ULID, stable, never reused
export type Len = number; // integer internal units (1in = 203200)
export type Expr = string; // "interior_w + 2*dado_d", "36in", "23/32\""

export interface Project {
  schemaVersion: 1;
  name: string;
  units: "imperial" | "metric"; // display + snap grid
  /** Extra thickness left on each face of a bookmatched part for planing; default 1/16". */
  planingAllowance?: Len;
  params: Param[];
  stock: Stock[];
  parts: PartDef[];
  instances: Instance[];
  patterns: Pattern[];
  joints: Joint[];
  matchSets: MatchSet[];
  structures: Structure[]; // woodworker-first layer
}

export interface Param {
  id: Id;
  name: string;
  expr: Expr;
  kind: "length" | "count" | "ratio";
}

export interface Stock {
  id: Id;
  name: string; // "3/4 Baltic birch", "4/4 walnut"
  kind: "sheet" | "solid" | "dimensional";
  thickness: Len; // actual, e.g. 23/32"
  sheet?: { length: Len; width: Len; grain: "along-length" | "none" };
  solid?: { standardLengths: Len[]; maxWidth: Len };
  allowance: { length: Len; width: Len }; // rough size = finished + allowance
  price?: { per: "sheet" | "boardFoot" | "linearFoot"; cents: number };
}

export interface PartDef {
  id: Id;
  name: string;
  stock: Id;
  length: Expr; // shoulder-to-shoulder (decision 3)
  width: Expr;
  thickness?: Expr; // default: stock.thickness
  grainLocked: boolean; // nesting may not rotate this part
  ops: UserOp[]; // roundovers etc.; joint cuts are derived, not stored
  notes?: string;
  /** Generated parts carry their source (Structures section). */
  source?: { structure: Id; role: string };
  /** Set when a generated part is edited by hand; the generator then leaves it alone. */
  detached?: boolean;
}

export interface Instance {
  id: Id;
  def: Id;
  name?: string;
  position: { x: Expr; y: Expr; z: Expr }; // in parent assembly frame
  orientation: number; // 0-23, right-angle rotations
  mirrored: boolean; // left side = mirrored right side
  parent?: Id; // assembly instance, optional
}

export interface Pattern {
  id: Id;
  source: Id; // instance to repeat
  count: Expr; // kind "count"
  axis: "x" | "y" | "z";
  spacing: { mode: "fixed"; step: Expr } | { mode: "distribute"; from: Expr; to: Expr };
}

export interface MatchSet {
  id: Id;
  name: string;
  type: "continuousGrain" | "bookmatch" | "sameBoard";
  members: Id[]; // instance ids, in order (order matters for continuousGrain)
  axis?: "length" | "width"; // continuousGrain: end-to-end or side-by-side
}

export interface Joint {
  id: Id;
  type: "dado" | "rabbet" | "throughDovetail"; // prototype set
  host: Id;
  guest: Id; // instance or pattern ids
  params: Record<string, Expr>; // per-type, see Operation specs
}

export type UserOp = { id: Id; type: "roundover"; edges: EdgeRef[]; radius: Expr };

export type EdgeRef = `${"end0" | "end1" | "edge0" | "edge1"}/${"face0" | "face1"}`; // e.g. "edge1/face1"

// Structures, openings & shop profile (woodworker-first layer)

export interface Structure {
  id: Id;
  type: "case" | "box"; // table base, frame, drawer in v1
  size: { w: Expr; h: Expr; d: Expr }; // overall dimensions, the source of truth
  options: Record<string, Expr | string | boolean>; // form fields, e.g. back: "inset-rabbet"
  openings: Opening[]; // a case starts with one opening = its interior
}

export interface Opening {
  id: Id;
  division?: // empty opening if absent
    | { type: "shelves"; count: Expr; spacing: "even" | Expr[] }
    | { type: "partition"; at: Expr } // creates two child openings
    | { type: "bays"; count: Expr };
  children: Opening[];
}

export interface ShopProfile {
  kerf: Len;
  /** Edge trim removed from every side of a sheet; default 0. */
  sheetTrim?: Len;
  /** Trim left at each end of rough solid stock; default 1/2". */
  solidTrim?: Len;
  /** Offcuts smaller than this on either side are waste; default 6". */
  minOffcut?: Len;
  tools: Array<
    | { type: "dadoStack"; maxWidth: Len }
    | { type: "router"; straightBits: Len[]; roundoverBits: Len[] }
    | { type: "handTools"; dovetails: boolean }
  >;
}

export interface Template {
  id: Id;
  name: string; // "Bookcase", "Keepsake box"
  structure: Omit<Structure, "id">;
  params: Param[];
}
