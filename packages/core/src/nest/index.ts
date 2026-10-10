// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Nesting for a whole project: sheet goods onto sheets, solid stock onto boards, match sets as
// units (Cut list & nesting, "Match sets: when design beats waste").

import { formatLength } from "../length";
import type { BoardLayout, Diagnostic, NestingResult, SheetLayout } from "../outputs";
import type { CutPart } from "../outputs/cutlist";
import type { Id, Len, MatchSet, Project, ShopProfile, Stock } from "../types";
import { INCH } from "../units";
import { type BoardItem, packBoards } from "./boards";
import { DEFAULT_MIN_OFFCUT, nestSheets, type SheetItem } from "./sheets";

/** Edge trim on rough solid stock: 1/2" per end (Cut list & nesting, "Inputs"). */
export const SOLID_END_TRIM: Len = INCH / 2;
/** Edge trim on sheet goods defaults to none. */
export const SHEET_TRIM: Len = 0;

export function nestProject(
  project: Project,
  parts: CutPart[],
  shop: ShopProfile,
): { result: NestingResult; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const sheets: SheetLayout[] = [];
  const boards: BoardLayout[] = [];
  const sheetCountByStock: Record<Id, number> = {};
  const kerf = shop.kerf;

  const byInstance = new Map(parts.map((p) => [p.instance.id, p]));

  for (const set of project.matchSets) {
    if (set.type === "bookmatch") {
      diagnostics.push({
        severity: "warning",
        rule: "not-solved-yet",
        message: `${set.name} is a bookmatch; its composite thickness needs a planing allowance the spec does not define, so it is nested as ordinary parts.`,
      });
    }
  }

  for (const stock of project.stock) {
    const mine = parts.filter((p) => p.part.stock === stock.id);
    if (mine.length === 0) continue;
    if (stock.kind === "sheet" && stock.sheet) {
      const layouts = nestSheetStock(project, stock, mine, kerf, byInstance, diagnostics);
      sheets.push(...layouts);
      sheetCountByStock[stock.id] = layouts.length;
    } else if (stock.solid) {
      boards.push(...nestSolidStock(project, stock, mine, kerf, byInstance, diagnostics));
    } else {
      diagnostics.push({
        severity: "warning",
        rule: "no-stock-sizes",
        message: `${stock.name} has no sheet or board sizes, so its parts are not nested.`,
      });
    }
  }
  return { result: { sheets, boards, sheetCountByStock }, diagnostics };
}

function nestSheetStock(
  project: Project,
  stock: Stock,
  mine: CutPart[],
  kerf: Len,
  byInstance: Map<Id, CutPart>,
  diagnostics: Diagnostic[],
): SheetLayout[] {
  const sheet = stock.sheet;
  if (!sheet) return [];
  const spec = { stock: stock.id, length: sheet.length, width: sheet.width };
  const options = { kerf, trim: SHEET_TRIM, minOffcut: DEFAULT_MIN_OFFCUT };
  const lockedFor = (p: CutPart): boolean => p.part.grainLocked && sheet.grain !== "none";

  const items: SheetItem[] = [];
  const layouts: SheetLayout[] = [];
  const done = new Set<Id>();

  for (const set of project.matchSets) {
    const members = set.members.map((id) => byInstance.get(id)).filter((m): m is CutPart => !!m);
    if (members.length === 0 || members[0]?.part.stock !== stock.id) continue;
    if (set.type === "bookmatch") continue; // nested as ordinary parts (warned)
    if (members.some((m) => m.part.stock !== stock.id)) {
      diagnostics.push({
        severity: "error",
        rule: "match-set-mixed-stock",
        message: `${set.name} mixes stock; all its parts must come from the same material.`,
      });
      continue;
    }
    for (const m of members) done.add(m.instance.id);

    if (set.type === "continuousGrain") {
      const alongLength = set.axis !== "width";
      const along = alongLength
        ? members.reduce((sum, m) => sum + m.length, 0) + kerf * (members.length - 1)
        : Math.max(...members.map((m) => m.length));
      const across = alongLength
        ? Math.max(...members.map((m) => m.width))
        : members.reduce((sum, m) => sum + m.width, 0) + kerf * (members.length - 1);
      items.push({
        instance: set.id,
        name: set.name,
        length: along,
        width: across,
        locked: true,
      });
    } else {
      // sameBoard: members must share one sheet; pack them alone, then keep that sheet as is.
      const alone = nestSheets(
        members.map((m) => ({
          instance: m.instance.id,
          name: m.part.name,
          length: m.length,
          width: m.width,
          locked: lockedFor(m),
        })),
        spec,
        options,
      );
      if (alone.sheets.length !== 1 || alone.tooLarge.length > 0) {
        diagnostics.push({
          severity: "error",
          rule: "match-set-too-large",
          message: `${set.name} needs all of its parts from one ${formatLength(sheet.length, project.units)} x ${formatLength(sheet.width, project.units)} sheet of ${stock.name}, and they do not fit on one.`,
        });
      }
      layouts.push(...alone.sheets);
    }
  }

  for (const p of mine) {
    if (done.has(p.instance.id)) continue;
    items.push({
      instance: p.instance.id,
      name: p.part.name,
      length: p.length,
      width: p.width,
      locked: lockedFor(p),
    });
  }

  const nested = nestSheets(items, spec, options);
  for (const item of nested.tooLarge) {
    diagnostics.push({
      severity: "error",
      rule: "part-too-large",
      message: `${item.name} (${formatLength(item.length, project.units)} x ${formatLength(item.width, project.units)}) is larger than a ${formatLength(sheet.length, project.units)} x ${formatLength(sheet.width, project.units)} sheet of ${stock.name}.`,
    });
  }
  return [...layouts, ...nested.sheets];
}

function nestSolidStock(
  project: Project,
  stock: Stock,
  mine: CutPart[],
  kerf: Len,
  byInstance: Map<Id, CutPart>,
  diagnostics: Diagnostic[],
): BoardLayout[] {
  const solid = stock.solid;
  if (!solid) return [];
  const layouts: BoardLayout[] = [];
  const grouped = new Set<Id>();
  const needed = (set: MatchSet, minimum: Len): void => {
    diagnostics.push({
      severity: "error",
      rule: "match-set-too-long",
      message: `${set.name} needs a board at least ${formatLength(minimum, project.units)} long of ${stock.name}, and none of the standard lengths is that long.`,
    });
  };

  for (const set of project.matchSets) {
    const members = set.members.map((id) => byInstance.get(id)).filter((m): m is CutPart => !!m);
    if (members.length === 0 || members[0]?.part.stock !== stock.id) continue;
    if (set.type === "bookmatch") continue;
    if (members.some((m) => m.part.stock !== stock.id)) {
      diagnostics.push({
        severity: "error",
        rule: "match-set-mixed-stock",
        message: `${set.name} mixes stock; all its parts must come from the same material.`,
      });
      continue;
    }
    for (const m of members) grouped.add(m.instance.id);

    const lengths = members.map((m) => m.length + stock.allowance.length);
    // Continuous grain runs end to end; same board only needs the parts to share a board.
    const composite =
      lengths.reduce((a, b) => a + b, 0) + kerf * (members.length - 1) + 2 * SOLID_END_TRIM;
    const width = Math.max(...members.map((m) => m.width));
    const minimum = Math.ceil(composite / INCH) * INCH;

    if (width + stock.allowance.width > solid.maxWidth) {
      diagnostics.push({
        severity: "error",
        rule: "part-too-wide",
        message: `${set.name} is wider than the widest ${stock.name} board (${formatLength(solid.maxWidth, project.units)}).`,
      });
    }
    if (!solid.standardLengths.some((l) => l >= composite)) needed(set, minimum);

    layouts.push({
      stock: stock.id,
      matchSet: set.id,
      composite: { length: composite, width, widthAllowance: stock.allowance.width },
      minBoardLength: minimum,
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
        message: `${p.part.name} is wider than the widest ${stock.name} board (${formatLength(solid.maxWidth, project.units)}).`,
        part: p.part.id,
      });
      continue;
    }
    items.push({
      instance: p.instance.id,
      name: p.part.name,
      length: p.length + stock.allowance.length,
    });
  }

  const packed = packBoards(items, solid.standardLengths, kerf, SOLID_END_TRIM);
  for (const item of packed.tooLong) {
    diagnostics.push({
      severity: "error",
      rule: "part-too-long",
      message: `${item.name} is longer than any standard ${stock.name} board.`,
    });
  }
  for (const board of packed.boards) {
    layouts.push({
      stock: stock.id,
      boardLength: board.length,
      sequence: board.items.map((it, i) => ({
        sequence: i + 1,
        of: board.items.length,
        name: it.name,
      })),
    });
  }
  return layouts;
}
