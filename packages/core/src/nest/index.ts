// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Nesting for a whole project: sheet goods onto sheets, solid stock onto boards, match sets as
// units (Cut list & nesting, "Match sets: when design beats waste"). A match set nests as one unit,
// then the rest of the parts pack around it.

import { formatLength, MAX_LENGTH } from "../length";
import type { BoardLayout, Diagnostic, NestingResult, SheetLayout, StockTotals } from "../outputs";
import type { CutPart } from "../outputs/cutlist";
import { rational } from "../rational";
import type { Id, Len, MatchSet, Project, ShopProfile, Stock } from "../types";
import { INCH } from "../units";
import { type BoardItem, type BoardSeed, packBoards } from "./boards";
import { DEFAULT_MIN_OFFCUT, nestSheets, type SheetItem } from "./sheets";

/** Edge trim on rough solid stock: 1/2" per end (Cut list & nesting, "Inputs"). */
export const SOLID_END_TRIM: Len = INCH / 2;
/**
 * Planing allowance per face when the project does not set one (maintainer ruling, ADR 013). A
 * bookmatch's two parts have four faces between them to plane after resawing.
 */
export const DEFAULT_PLANING_ALLOWANCE: Len = INCH / 16;
/** Edge trim on sheet goods defaults to none. */
export const SHEET_TRIM: Len = 0;

interface SetMembers {
  set: MatchSet;
  members: CutPart[];
}

/** The match sets whose parts are of this stock, with their members found. */
function setsOn(project: Project, stock: Stock, byInstance: Map<Id, CutPart>): SetMembers[] {
  const out: SetMembers[] = [];
  for (const set of project.matchSets) {
    const members = set.members.map((id) => byInstance.get(id)).filter((m): m is CutPart => !!m);
    if (members.length > 0 && members[0]?.part.stock === stock.id) out.push({ set, members });
  }
  return out;
}

/** The shop's saw and trim settings, with the spec's defaults filled in. */
interface NestSettings {
  kerf: Len;
  sheetTrim: Len;
  solidTrim: Len;
  minOffcut: Len;
}

export function nestProject(
  project: Project,
  parts: CutPart[],
  shop: ShopProfile,
): { result: NestingResult; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const sheets: SheetLayout[] = [];
  const boards: BoardLayout[] = [];
  const sheetCountByStock: Record<Id, number> = {};
  const settings: NestSettings = {
    kerf: shop.kerf,
    sheetTrim: shop.sheetTrim ?? SHEET_TRIM,
    solidTrim: shop.solidTrim ?? SOLID_END_TRIM,
    minOffcut: shop.minOffcut ?? DEFAULT_MIN_OFFCUT,
  };
  const totals: StockTotals[] = [];
  for (const set of project.matchSets) {
    if (set.members.length === 0) {
      diagnostics.push({
        severity: "warning",
        rule: "match-set-empty",
        message: `${set.name} has no parts, so it does nothing.`,
        field: set.name,
      });
    }
  }
  const byInstance = new Map(parts.map((p) => [p.instance.id, p]));

  for (const stock of project.stock) {
    const mine = parts.filter((p) => p.part.stock === stock.id);
    if (mine.length === 0) continue;
    if (stock.kind === "sheet" && stock.sheet) {
      const layouts = nestSheetStock(project, stock, mine, settings, byInstance, diagnostics);
      sheets.push(...layouts);
      sheetCountByStock[stock.id] = layouts.length;
      totals.push({ stock: stock.id, sheets: layouts.length });
    } else if (stock.solid) {
      const nested = nestSolidStock(project, stock, mine, settings, byInstance, diagnostics);
      boards.push(...nested.layouts);
      totals.push({ stock: stock.id, ...nested.totals });
    } else {
      diagnostics.push({
        severity: "warning",
        rule: "no-stock-sizes",
        message: `${stock.name} has no sheet or board sizes, so its parts are not nested.`,
        field: stock.name,
      });
    }
  }
  return { result: { sheets, boards, sheetCountByStock, totals }, diagnostics };
}

function mixedStock(set: MatchSet, members: CutPart[], stock: Stock): boolean {
  return members.some((m) => m.part.stock !== stock.id) || members.length !== set.members.length;
}

function nestSheetStock(
  project: Project,
  stock: Stock,
  mine: CutPart[],
  settings: NestSettings,
  byInstance: Map<Id, CutPart>,
  diagnostics: Diagnostic[],
): SheetLayout[] {
  const { kerf } = settings;
  const sheet = stock.sheet;
  if (!sheet) return [];
  const spec = { stock: stock.id, length: sheet.length, width: sheet.width };
  const options = { kerf, trim: settings.sheetTrim, minOffcut: settings.minOffcut };
  const lockedFor = (p: CutPart): boolean => p.part.grainLocked && sheet.grain !== "none";
  const asItem = (p: CutPart): SheetItem => ({
    instance: p.instance.id,
    name: p.part.name,
    length: p.length,
    width: p.width,
    locked: lockedFor(p),
  });

  const items: SheetItem[] = [];
  const groups: SheetItem[][] = [];
  const done = new Set<Id>();

  for (const { set, members } of setsOn(project, stock, byInstance)) {
    if (mixedStock(set, members, stock)) {
      diagnostics.push({
        severity: "error",
        rule: "match-set-mixed-stock",
        message: `${set.name} mixes stock; all its parts must come from the same stock.`,
        field: set.name,
      });
      continue;
    }
    if (set.type === "bookmatch") {
      // A resawn board of solid wood only; on sheet goods the parts are nested as ordinary parts.
      diagnostics.push({
        severity: "warning",
        rule: "bookmatch-needs-solid-stock",
        message: `${set.name} is a bookmatch, which is cut from one resawn solid board; on ${stock.name} its parts are nested as ordinary parts.`,
        field: set.name,
      });
      continue;
    }
    for (const m of members) done.add(m.instance.id);

    if (set.type === "continuousGrain") {
      const across = set.axis === "width";
      const along = across
        ? Math.max(...members.map((m) => m.length))
        : members.reduce((sum, m) => sum + m.length, 0) + kerf * (members.length - 1);
      const wide = across
        ? members.reduce((sum, m) => sum + m.width, 0) + kerf * (members.length - 1)
        : Math.max(...members.map((m) => m.width));
      items.push({
        instance: set.id,
        name: set.name,
        length: along,
        width: wide,
        locked: true,
        layout: across ? "across" : "along",
        members: members.map((m) => ({
          instance: m.instance.id,
          name: m.part.name,
          length: m.length,
          width: m.width,
        })),
      });
    } else {
      groups.push(members.map(asItem));
    }
  }

  for (const p of mine) if (!done.has(p.instance.id)) items.push(asItem(p));

  const nested = nestSheets(items, spec, options, groups);
  const size = `${formatLength(sheet.length, project.units)} x ${formatLength(sheet.width, project.units)}`;
  for (const item of nested.tooLarge) {
    diagnostics.push({
      severity: "error",
      rule: "part-too-large",
      message: `${item.name} (${formatLength(item.length, project.units)} x ${formatLength(item.width, project.units)}) is larger than a ${size} sheet of ${stock.name}.`,
      field: item.name,
    });
  }
  for (const group of nested.groupsTooLarge) {
    const set = project.matchSets.find((s) => s.members.includes(group[0]?.instance ?? ""));
    diagnostics.push({
      severity: "error",
      rule: "match-set-too-large",
      message: `${set?.name ?? "A match set"} needs all of its parts from one ${size} sheet of ${stock.name}, and they do not fit on one.`,
      field: set?.name,
    });
  }
  return nested.sheets;
}

function nestSolidStock(
  project: Project,
  stock: Stock,
  mine: CutPart[],
  settings: NestSettings,
  byInstance: Map<Id, CutPart>,
  diagnostics: Diagnostic[],
): { layouts: BoardLayout[]; totals: Omit<StockTotals, "stock"> } {
  const { kerf, solidTrim } = settings;
  const none = { layouts: [], totals: {} };
  const solid = stock.solid;
  if (!solid) return none;
  const fmt = (n: Len): string => formatLength(n, project.units);
  const grouped = new Set<Id>();
  const seeds: BoardSeed[] = [];
  const setLayouts = new Map<Id, BoardLayout>();

  for (const { set, members } of setsOn(project, stock, byInstance)) {
    if (mixedStock(set, members, stock)) {
      diagnostics.push({
        severity: "error",
        rule: "match-set-mixed-stock",
        message: `${set.name} mixes stock; all its parts must come from the same stock.`,
        field: set.name,
      });
      continue;
    }
    for (const m of members) grouped.add(m.instance.id);

    const lengths = members.map((m) => m.length + stock.allowance.length);
    const widths = members.map((m) => m.width);
    const bookmatch = set.type === "bookmatch";
    const sideBySide = set.type === "continuousGrain" && set.axis === "width";
    const kerfs = kerf * (members.length - 1);
    // End to end: lengths add; side by side: the widest length, and widths add. A bookmatch is
    // the members stacked in thickness from one board: its length and width are the largest's.
    const length =
      sideBySide || bookmatch ? Math.max(...lengths) : lengths.reduce((a, b) => a + b, 0) + kerfs;
    const width = sideBySide ? widths.reduce((a, b) => a + b, 0) + kerfs : Math.max(...widths);
    const compositeThickness = bookmatch
      ? members.reduce((sum, m) => sum + m.thickness, 0) +
        kerfs +
        2 * members.length * (project.planingAllowance ?? DEFAULT_PLANING_ALLOWANCE)
      : undefined;
    if (bookmatch && members.length < 2) {
      diagnostics.push({
        severity: "warning",
        rule: "bookmatch-needs-pair",
        message: `${set.name} is a bookmatch of one part; a bookmatch needs a pair opened like a book.`,
        field: set.name,
      });
    }
    if (compositeThickness !== undefined && compositeThickness > MAX_LENGTH) {
      diagnostics.push({
        severity: "error",
        rule: "out-of-range",
        message: `${set.name} would need a board thicker than the limit of 100,000 inches; check the planing allowance.`,
        field: set.name,
      });
      continue;
    }
    if (compositeThickness !== undefined && compositeThickness > stock.thickness) {
      diagnostics.push({
        severity: "warning",
        rule: "bookmatch-needs-thicker-stock",
        message: `${set.name} needs a board ${fmt(compositeThickness)} thick (the parts, the saw gap and planing every face), and ${stock.name} is ${fmt(stock.thickness)} thick.`,
        field: set.name,
      });
    }
    const composite = length + 2 * solidTrim;
    const minimum = Math.ceil(composite / INCH) * INCH;

    if (width + stock.allowance.width > solid.maxWidth) {
      diagnostics.push({
        severity: "error",
        rule: "part-too-wide",
        message: `${set.name} is wider than the widest ${stock.name} board (${fmt(solid.maxWidth)}).`,
        field: set.name,
      });
    }
    if (!solid.standardLengths.some((l) => l >= composite)) {
      diagnostics.push({
        severity: "error",
        rule: "match-set-too-long",
        message: `${set.name} needs a board at least ${fmt(minimum)} long of ${stock.name}, and none of the standard lengths is that long.`,
        field: set.name,
      });
      continue;
    }

    seeds.push({ id: set.id, minLength: composite });
    setLayouts.set(set.id, {
      stock: stock.id,
      matchSet: set.id,
      composite: { length: composite, width, widthAllowance: stock.allowance.width },
      minBoardLength: minimum,
      ...(compositeThickness !== undefined ? { compositeThickness } : {}),
      sequence: members.map((m, i) => ({ sequence: i + 1, of: members.length, name: m.part.name })),
    });
  }

  const items: BoardItem[] = [];
  for (const p of mine) {
    if (grouped.has(p.instance.id)) continue;
    if (p.width + stock.allowance.width > solid.maxWidth) {
      diagnostics.push({
        severity: "error",
        rule: "part-too-wide",
        message: `${p.part.name} is wider than the widest ${stock.name} board (${fmt(solid.maxWidth)}).`,
        part: p.part.id,
        field: p.part.name,
      });
      continue;
    }
    items.push({
      instance: p.instance.id,
      name: p.part.name,
      length: p.length + stock.allowance.length,
    });
  }

  const packed = packBoards(items, solid.standardLengths, kerf, solidTrim, seeds);
  for (const seed of packed.unplaced) {
    // The checks above make this unreachable; if they ever diverge it must not go quiet.
    diagnostics.push({
      severity: "error",
      rule: "internal-error",
      message: `A match set (${seed.id}) could not be placed on any board. This is a bug; please report it.`,
    });
  }
  for (const item of packed.tooLong) {
    diagnostics.push({
      severity: "error",
      rule: "part-too-long",
      message: `${item.name} is longer than any standard ${stock.name} board.`,
      field: item.name,
    });
  }

  const layouts: BoardLayout[] = [];
  for (const [index, board] of packed.boards.entries()) {
    const sets = board.seeds
      .map((id) => setLayouts.get(id))
      .filter((l): l is BoardLayout => l !== undefined);
    if (sets.length === 0) {
      layouts.push({
        stock: stock.id,
        boardLength: board.length,
        sequence: board.items.map((it, i) => ({
          sequence: i + 1,
          of: board.items.length,
          name: it.name,
        })),
      });
      continue;
    }
    // One layout per match set; when several share a board each says which board it is, and the
    // other parts that are cut from the board are listed with the first.
    for (const [n, set] of sets.entries()) {
      layouts.push({
        ...set,
        boardLength: board.length,
        ...(sets.length > 1 ? { boardIndex: index } : {}),
        ...(n === 0 && board.items.length > 0
          ? { alsoOnBoard: board.items.map((i) => ({ name: i.name, instance: i.instance })) }
          : {}),
      });
    }
  }
  return { layouts, totals: solidTotals(stock, mine, packed.boards) };
}

/**
 * Board feet of the rough parts and linear feet of boards bought. The nominal thickness is the
 * stock's thickness rounded up to a quarter inch (ADR 013).
 */
function solidTotals(
  stock: Stock,
  parts: CutPart[],
  bought: Array<{ length: Len }>,
): Omit<StockTotals, "stock"> {
  const quarter = INCH / 4;
  const nominal = Math.ceil(stock.thickness / quarter) * quarter;
  let volume = 0n; // cubic units of rough parts at nominal thickness
  for (const p of parts) {
    const rough =
      BigInt(p.length + stock.allowance.length) * BigInt(p.width + stock.allowance.width);
    volume += rough * BigInt(nominal);
  }
  const cubicInch = BigInt(INCH) ** 3n;
  const length = bought.reduce((sum, b) => sum + BigInt(b.length), 0n);
  return {
    boards: bought.length,
    boardFeet: rational(volume, cubicInch * 144n),
    linearFeet: rational(length, BigInt(INCH) * 12n),
  };
}
