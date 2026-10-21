// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The pegboard while it is being changed (design spec, §1 "Your shop"; ADR 016, D3): which tools
// and woods are hung, and each tool's settings, kept while it is taken down so hanging it again
// brings them back. Nothing is saved until the screen turns the wall into a record.

import { type Id, INCH, type Len, type Stock } from "@kerf/core";
import { DEFAULT_KERF, type ShopRecord } from "./shop-record";
import { STARTER_DADO_WIDTH } from "./starter";

/** Every tool on the pegboard, in the order the wall shows them. */
export const PEG_TOOLS = [
  "tableSaw",
  "dadoStack",
  "router",
  "trackSaw",
  "drill",
  "chisels",
  "dovetailSaw",
] as const;

/** One tool on the pegboard. */
export type PegTool = (typeof PEG_TOOLS)[number];

/** The settings of every tool that has some, as the record keeps them. */
export interface ToolSettings {
  tableSaw: NonNullable<ShopRecord["tableSaw"]>;
  trackSaw: NonNullable<ShopRecord["trackSaw"]>;
  dadoStack: NonNullable<ShopRecord["dadoStack"]>;
  router: NonNullable<ShopRecord["router"]>;
}

/** A tool that has settings. */
export type SetTool = keyof ToolSettings;

/** The pegboard: what is hung, every tool's settings, and every wood card shown. */
export interface Wall {
  /**
   * The record the wall came from; what the wall does not show (answers, trims) is kept as it was.
   */
  from: ShopRecord;
  tools: ReadonlySet<PegTool>;
  settings: ToolSettings;
  /** Every wood card, hung or not, in the order shown. */
  wood: readonly Stock[];
  woodHung: ReadonlySet<Id>;
}

const hasTool = (record: ShopRecord, tool: PegTool): boolean =>
  record[tool] !== null && record[tool] !== false;

/** The wall as `record` has it. A tool not hung gets the usual settings it would be hung with. */
export function wallFrom(record: ShopRecord): Wall {
  return {
    from: record,
    tools: new Set(PEG_TOOLS.filter((tool) => hasTool(record, tool))),
    settings: {
      tableSaw: record.tableSaw ?? { kerf: DEFAULT_KERF },
      trackSaw: record.trackSaw ?? { kerf: DEFAULT_KERF },
      dadoStack: record.dadoStack ?? { maxWidth: STARTER_DADO_WIDTH },
      router: record.router ?? { bits: [] },
    },
    wood: record.stock,
    woodHung: new Set(record.stock.map((s) => s.id)),
  };
}

/** True when `tool` is hung on `wall`. */
export function isHung(wall: Wall, tool: PegTool): boolean {
  return wall.tools.has(tool);
}

const flipped = <T>(set: ReadonlySet<T>, item: T): ReadonlySet<T> => {
  const next = new Set(set);
  if (!next.delete(item)) next.add(item);
  return next;
};

/** The wall with `tool` hung, or taken down if it was hung. Its settings stay either way. */
export function toggleTool(wall: Wall, tool: PegTool): Wall {
  return { ...wall, tools: flipped(wall.tools, tool) };
}

/** The wall with `tool`'s settings changed. */
export function setSettings<T extends SetTool>(wall: Wall, tool: T, value: ToolSettings[T]): Wall {
  return { ...wall, settings: { ...wall.settings, [tool]: value } };
}

/** The wall with the wood `id` hung, or taken down; its card stays on the wall either way. */
export function toggleWood(wall: Wall, id: Id): Wall {
  return { ...wall, woodHung: flipped(wall.woodHung, id) };
}

/** The wall with a wood of the woodworker's own added after the others, hung. */
export function addWood(wall: Wall, stock: Stock): Wall {
  return { ...wall, wood: [...wall.wood, stock], woodHung: new Set([...wall.woodHung, stock.id]) };
}

/** How many tools and woods are hung. */
export function hungCount(wall: Wall): number {
  return wall.tools.size + wall.woodHung.size;
}

/** The record the wall says, with `setUp` as given: true once "That's my shop" is pressed. */
export function recordOf(wall: Wall, setUp: boolean): ShopRecord {
  const settingsIf = <T extends SetTool>(tool: T): ToolSettings[T] | null =>
    wall.tools.has(tool) ? wall.settings[tool] : null;
  return {
    ...wall.from,
    setUp,
    tableSaw: settingsIf("tableSaw"),
    trackSaw: settingsIf("trackSaw"),
    dadoStack: settingsIf("dadoStack"),
    router: settingsIf("router"),
    drill: wall.tools.has("drill"),
    chisels: wall.tools.has("chisels"),
    dovetailSaw: wall.tools.has("dovetailSaw"),
    stock: wall.wood.filter((s) => wall.woodHung.has(s.id)),
  };
}

/** How a wood of your own comes: in sheets or as boards. */
export type WoodKind = "sheet" | "board";

/**
 * A wood of the woodworker's own, `thickness` thick (project units), in the starter stock's sizes:
 * 4x8 sheets with the grain along their length, or boards in 8' lengths up to 8" wide with 1/4"
 * left to straighten an edge (model/starter.ts, the walnut).
 */
export function ownWood(id: Id, name: string, kind: WoodKind, thickness: Len): Stock {
  return kind === "sheet"
    ? {
        id,
        name,
        kind: "sheet",
        thickness,
        sheet: { length: 96 * INCH, width: 48 * INCH, grain: "along-length" },
        allowance: { length: 0, width: 0 },
      }
    : {
        id,
        name,
        kind: "solid",
        thickness,
        solid: { standardLengths: [96 * INCH], maxWidth: 8 * INCH },
        allowance: { length: 0, width: INCH / 4 },
      };
}
