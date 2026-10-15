// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// New project (design spec §3, ADR 016): what the New project panel asks, turned into one project. The panel
// only gathers choices; everything that can be wrong with them is found here, in plain words, before Create.

import {
  formatLength,
  gridSize,
  type Id,
  type Project,
  type Stock,
  type Structure,
} from "@kerf/core";
import {
  type Edit,
  setOption,
  setShelves,
  setSize,
  startProject,
  type TemplateName,
} from "./commands";
import { sizeLabel, sizeOrder } from "./labels";
import type { ShopRecord } from "./shop-record";
import { explainSize, literalFor, readLength } from "./size";
import { DEFAULT_GAP, DEFAULT_GAP_METRIC, outsideFromSpace, type Size3 } from "./space";
import { STOCK_IDS, starterStockFor } from "./starter";

/** Every kind of piece the New project panel offers, in the gallery or among the blanks. */
export type PieceId =
  | "bookcase"
  | "cabinet"
  | "box"
  | "table"
  | "dresser"
  | "idea"
  | "empty"
  | "plainCase"
  | "plainBox";

/** One thing the panel can start. `template` is null for a piece with no form; `later` pieces are not built yet. */
export interface Piece {
  id: PieceId;
  name: string;
  blurb: string;
  template: TemplateName | null;
  later: boolean;
}

/** The gallery, in the order the panel shows it. */
export const PIECES: readonly Piece[] = [
  {
    id: "bookcase",
    name: "Bookcase",
    blurb: "Open shelves in a case",
    template: "Bookcase",
    later: false,
  },
  {
    id: "cabinet",
    name: "Cabinet",
    blurb: "A case for storage; doors and drawers coming later",
    template: "Blank case",
    later: false,
  },
  {
    id: "box",
    name: "Box",
    blurb: "Four sides and a bottom",
    template: "Keepsake box",
    later: false,
  },
  { id: "table", name: "Table", blurb: "Dining, coffee, side", template: null, later: true },
  { id: "dresser", name: "Dresser", blurb: "A case with drawers", template: null, later: true },
  {
    id: "idea",
    name: "Something else",
    blurb: "Note the idea, start blank",
    template: null,
    later: false,
  },
];

/** The blank starts, below the gallery. */
export const BLANKS: readonly Piece[] = [
  {
    id: "empty",
    name: "Empty project",
    blurb: "No form: draw boards yourself",
    template: null,
    later: false,
  },
  {
    id: "plainCase",
    name: "Plain case",
    blurb: "A plain case to divide",
    template: "Blank case",
    later: false,
  },
  {
    id: "plainBox",
    name: "Plain box",
    blurb: "A plain box to fill",
    template: "Blank box",
    later: false,
  },
];

/** Everything the New project panel gathers. Sizes are text as typed, so they can be wrong until Create. */
export interface NewProjectChoice {
  piece: PieceId;
  units: Project["units"];
  /** `outside` sizes the piece; `space` sizes it to an opening, less `gap`. */
  sizeMode: "outside" | "space";
  /** Width of a case or length of a box. */
  w: string;
  /** Height. */
  h: string;
  /** Depth of a case or width of a box. */
  d: string;
  gap: string;
  shelves: number;
  /** Whether a cabinet has a back. */
  back: boolean;
  /** The stock the case's sides, top and bottom (or the box's walls) are cut from. */
  wood: Id;
  /** What "Something else" is going to be, in the woodworker's words. */
  note: string;
}

/** The choice a refusal is about, so the panel can say it under that field. */
export type ChoiceField = "w" | "h" | "d" | "gap" | "wood";

/**
 * What `newProject` makes: the project as an edit, the outside size when it came from a space, the idea;
 * or why not, with the `field` it is about when it is about one.
 */
export type NewProjectResult =
  | { ok: true; edit: Edit; outside: Size3 | null; note: string }
  | { ok: false; message: string; field?: ChoiceField };

const SIZES = {
  imperial: {
    case: ['36"', '72"', '12"'],
    box: ['12"', '6"', '8"'],
    gap: formatLength(DEFAULT_GAP, "imperial"),
  },
  metric: {
    case: ["900 mm", "1800 mm", "300 mm"],
    box: ["300 mm", "150 mm", "200 mm"],
    gap: formatLength(DEFAULT_GAP_METRIC, "metric"),
  },
} as const;

/** The pieces sized as a box (length, height, width) rather than a case. */
const BOX_PIECES: readonly PieceId[] = ["box", "plainBox"];

const allPieces = [...PIECES, ...BLANKS];

/** The piece `id`, from the gallery or the blanks. Throws RangeError for an id that names none. */
export function pieceFor(id: PieceId): Piece {
  const found = allPieces.find((p) => p.id === id);
  if (!found) throw new RangeError(`There is no piece "${id}".`);
  return found;
}

/** The form piece `id` is built as, which names its size fields; null for a piece with no form. */
export function formOf(id: PieceId): Structure["type"] | null {
  if (!pieceFor(id).template) return null;
  return BOX_PIECES.includes(id) ? "box" : "case";
}

/** The thickest sheet in the shop, which is what a case is built from unless told otherwise. */
function thickestSheet(stock: readonly Stock[]): Stock | undefined {
  return stock
    .filter((s) => s.kind === "sheet")
    .reduce<Stock | undefined>(
      (best, s) => (best && best.thickness >= s.thickness ? best : s),
      undefined,
    );
}

/**
 * The panel's starting choices for `piece`: the usual size for the piece in `units`, four shelves, a back,
 * and the thickest sheet in the shop's stock.
 */
export function defaultChoice(
  piece: PieceId,
  units: Project["units"],
  record: ShopRecord,
): NewProjectChoice {
  const offered = woodOffered(units, record);
  const [w, h, d] = SIZES[units][BOX_PIECES.includes(piece) ? "box" : "case"];
  return {
    piece,
    units,
    sizeMode: "outside",
    w,
    h,
    d,
    gap: SIZES[units].gap,
    shelves: 4,
    back: true,
    wood: (thickestSheet(offered) ?? offered[0])?.id ?? STOCK_IDS.plywood34,
    note: "",
  };
}

/**
 * The wood a new project in `units` can be built from: the shop's stock first, then any starter stock the
 * shop lacks, so the templates' own stock ids always resolve. A metric project keeps only wood whose thickness
 * is a whole number of 0.01 mm steps (the 3/4 plywood is not), since every length there sits on that grid.
 */
export function woodOffered(units: Project["units"], record: ShopRecord): Stock[] {
  const fits = (s: Stock): boolean =>
    units === "imperial" || s.thickness % gridSize("metric") === 0;
  const shop = record.stock.filter(fits);
  const held = new Set(shop.map((s) => s.id));
  return [...shop, ...starterStockFor(units).filter((s) => !held.has(s.id))];
}

function emptyProject(name: string, units: Project["units"], record: ShopRecord): Project {
  return {
    schemaVersion: 1,
    name,
    units,
    params: [],
    stock: woodOffered(units, record),
    parts: [],
    instances: [],
    patterns: [],
    joints: [],
    matchSets: [],
    structures: [],
  };
}

type Refusal = { ok: false; message: string; field: ChoiceField };
type Typed = { ok: true; value: number } | Refusal;

function readSize(
  choice: NewProjectChoice,
  field: "w" | "h" | "d" | "gap",
  project: Project,
  label: string,
): Typed {
  const text = choice[field];
  const refuse = (message: string): Refusal => ({ ok: false, message, field });
  if (text.trim() === "") return refuse(`Type a ${label.toLowerCase()}.`);
  const read = readLength(text, project, undefined, label);
  if (!read.ok) return refuse(explainSize(label, text, read.message));
  // A gap of nothing is a piece that fills the space exactly; a size of nothing is no piece.
  if (read.value <= 0 && field !== "gap") return refuse(`${label} must be more than zero.`);
  return { ok: true, value: read.value };
}

/** The outside size the choice asks for, typed or worked out from the space; or why it cannot be. */
function outsideOf(
  choice: NewProjectChoice,
  project: Project,
): { ok: true; size: Size3 } | Refusal {
  const type = project.structures[0]?.type ?? "case";
  const typed: Partial<Size3> = {};
  for (const key of sizeOrder(type)) {
    const read = readSize(choice, key, project, sizeLabel(type, key));
    if (!read.ok) return read;
    typed[key] = read.value;
  }
  const size = typed as Size3;
  if (choice.sizeMode === "outside") return { ok: true, size };
  const gap = readSize(choice, "gap", project, "Gap");
  if (!gap.ok) return gap;
  const outside = outsideFromSpace(size, gap.value);
  return outside.ok ? outside : { ...outside, field: "gap" };
}

function withSizes(project: Project, size: Size3): Project | string {
  const structure = project.structures[0];
  if (!structure) return "This project has nothing to size.";
  let sized = project;
  for (const key of sizeOrder(structure.type)) {
    const edit = setSize(sized, structure.id, key, literalFor(size[key], project.units));
    if (!edit.ok) return edit.message;
    sized = edit.edit.project;
  }
  return sized;
}

/**
 * The project the panel's choices describe, named after the piece. A piece that is not built yet, a size that
 * is empty, zero or not a length, a gap that eats the space, or wood the shop does not stock comes back as
 * `ok: false` with a message to show and the field it is about. "Something else" and the empty project start
 * with no form; the idea comes back as `note` because a project has nowhere to keep it.
 */
export function newProject(choice: NewProjectChoice, record: ShopRecord): NewProjectResult {
  const piece = pieceFor(choice.piece);
  if (piece.later) {
    return {
      ok: false,
      message: `Kerf can't build a ${piece.name.toLowerCase()} yet; it's coming. Start from a blank project or a plain case in the meantime.`,
    };
  }
  const note = choice.note.trim();
  if (!piece.template) {
    const idea = choice.piece === "idea";
    const project = emptyProject(idea ? "New idea" : "Untitled", choice.units, record);
    return { ok: true, edit: { project, label: "New empty project" }, outside: null, note };
  }
  const started = startProject(piece.template, choice.units);
  // Named after the piece, not the template it is built from (design spec §3).
  const merged = {
    ...started.project,
    name: piece.name,
    stock: woodOffered(choice.units, record),
  };
  if (!merged.stock.some((s) => s.id === choice.wood)) {
    return {
      ok: false,
      message: "That wood is not in your shop's stock; pick one from the list.",
      field: "wood",
    };
  }
  const outside = outsideOf(choice, merged);
  if (!outside.ok) return outside;
  const sized = withSizes(merged, outside.size);
  if (typeof sized === "string") return { ok: false, message: sized };

  const structure = sized.structures[0];
  const root = structure?.openings[0];
  if (!structure || !root)
    throw new RangeError(`The "${piece.template}" template has no structure.`);
  let project = sized;
  if (choice.piece === "bookcase") {
    const shelves = setShelves(project, structure.id, root.id, String(choice.shelves), "even");
    if (!shelves.ok) return shelves;
    project = shelves.edit.project;
  }
  if (choice.piece === "cabinet") {
    // The case's back option: "none", "inset-rabbet" or "applied" (core/src/structures/case.ts, line 56).
    project = setOption(
      project,
      structure.id,
      "back",
      choice.back ? "inset-rabbet" : "none",
    ).project;
  }
  const woodField = structure.type === "case" ? "carcaseStock" : "wallStock";
  project = setOption(project, structure.id, woodField, choice.wood).project;
  return {
    ok: true,
    edit: { project, label: `New ${piece.name.toLowerCase()}` },
    outside: choice.sizeMode === "space" ? outside.size : null,
    note,
  };
}
