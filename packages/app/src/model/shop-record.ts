// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The shop as hung on the pegboard (ADR 016, D3). It keeps every tool and bit the woodworker owns,
// so Kerf already knows when later joinery needs them; the engine is given only what it understands
// today.

import { INCH, type Len, type ShopProfile, type Stock } from "@kerf/core";
import { STARTER_DADO_WIDTH, STARTER_STOCK } from "./starter";

/** Every shape a router bit can have. */
export const BIT_SHAPES = [
  "roundover",
  "chamfer",
  "cove",
  "ogee",
  "straight",
  "rabbeting",
] as const;

/** The shape a router bit cuts. Edge shapes are sized by radius; straight bits by cutting width. */
export type BitShape = (typeof BIT_SHAPES)[number];

const eighths = (...n: number[]): Len[] => n.map((k) => (k * INCH) / 8);

/**
 * The sizes the router card offers to tap for each shape: the common bits sold in sets (radius for
 * edge shapes, cutting width for a straight bit). Any other size is typed on the card.
 */
export const USUAL_BIT_SIZES: Readonly<Record<BitShape, readonly Len[]>> = {
  roundover: eighths(1, 2, 3, 4),
  chamfer: eighths(2, 4),
  cove: eighths(2, 3, 4),
  ogee: eighths(2, 3),
  straight: eighths(2, 3, 4, 6),
  rabbeting: eighths(3, 4),
};

/** One router bit on the router card. */
export interface RouterBit {
  shape: BitShape;
  /** Radius for edge shapes, cutting width for a straight bit (project units). */
  size: Len;
}

/** Every topic "ask when it matters" can ask about (ADR 016, D4). */
export const TOOL_TOPICS = ["saw", "dadoStack", "router", "handTools"] as const;

/** What "ask when it matters" can ask about (ADR 016, D4). */
export type ToolTopic = (typeof TOOL_TOPICS)[number];

/** Everything on the pegboard. A `null` tool is one the shop does not have. */
export interface ShopRecord {
  version: 2;
  /** True once the pegboard has been saved: every tool on it, hung or not, is then known. */
  setUp: boolean;
  tableSaw: { kerf: Len } | null;
  trackSaw: { kerf: Len } | null;
  dadoStack: { maxWidth: Len } | null;
  router: { bits: RouterBit[] } | null;
  drill: boolean;
  chisels: boolean;
  dovetailSaw: boolean;
  /** The wood new projects start with. */
  stock: Stock[];
  /** Topics answered one at a time after a skipped pegboard. */
  told: ToolTopic[];
  /**
   * Carried from a saved version-1 shop (no editor yet): the engine's sheet trim, in project units.
   */
  sheetTrim?: Len;
  /** Carried from a saved version-1 shop: the engine's board end trim, in project units. */
  solidTrim?: Len;
  /** Carried from a saved version-1 shop: the smallest offcut worth keeping, in project units. */
  minOffcut?: Len;
}

/** The cut width assumed when the shop has no saw on its wall: a common 1/8" blade. */
export const DEFAULT_KERF: Len = INCH / 8;

/** The starter shop, as on a skipped pegboard: the same as M4's starter shop. */
export const STARTER_RECORD: ShopRecord = {
  version: 2,
  setUp: false,
  tableSaw: { kerf: DEFAULT_KERF },
  trackSaw: null,
  dadoStack: { maxWidth: STARTER_DADO_WIDTH },
  router: { bits: [{ shape: "roundover", size: INCH / 8 }] },
  drill: false,
  chisels: true,
  dovetailSaw: true,
  stock: [...STARTER_STOCK],
  told: [],
};

const sizesOf = (bits: readonly RouterBit[], shape: BitShape): Len[] =>
  bits.filter((b) => b.shape === shape).map((b) => b.size);

/**
 * The engine's view of the shop: cut width, dado stack, router bits and hand-cut dovetails only.
 */
export function shopProfileFor(record: ShopRecord): ShopProfile {
  const tools: ShopProfile["tools"] = [];
  if (record.dadoStack) tools.push({ type: "dadoStack", maxWidth: record.dadoStack.maxWidth });
  if (record.router)
    tools.push({
      type: "router",
      straightBits: sizesOf(record.router.bits, "straight"),
      roundoverBits: sizesOf(record.router.bits, "roundover"),
    });
  tools.push({ type: "handTools", dovetails: record.chisels && record.dovetailSaw });
  return {
    kerf: record.tableSaw?.kerf ?? record.trackSaw?.kerf ?? DEFAULT_KERF,
    tools,
    ...(record.sheetTrim !== undefined && { sheetTrim: record.sheetTrim }),
    ...(record.solidTrim !== undefined && { solidTrim: record.solidTrim }),
    ...(record.minOffcut !== undefined && { minOffcut: record.minOffcut }),
  };
}

/**
 * A version-1 saved shop (a `ShopProfile`) read as a set-up pegboard, so nothing it said is lost.
 */
export function recordFromProfile(profile: ShopProfile, stock: readonly Stock[]): ShopRecord {
  const dado = profile.tools.find((t) => t.type === "dadoStack");
  const router = profile.tools.find((t) => t.type === "router");
  const hand = profile.tools.find((t) => t.type === "handTools");
  return {
    ...STARTER_RECORD,
    setUp: true,
    tableSaw: { kerf: profile.kerf },
    dadoStack: dado ? { maxWidth: dado.maxWidth } : null,
    router: router
      ? {
          bits: [
            ...router.straightBits.map((size) => ({ shape: "straight" as const, size })),
            ...router.roundoverBits.map((size) => ({ shape: "roundover" as const, size })),
          ],
        }
      : null,
    chisels: hand?.dovetails ?? false,
    dovetailSaw: hand?.dovetails ?? false,
    stock: [...stock],
    ...(profile.sheetTrim !== undefined && { sheetTrim: profile.sheetTrim }),
    ...(profile.solidTrim !== undefined && { solidTrim: profile.solidTrim }),
    ...(profile.minOffcut !== undefined && { minOffcut: profile.minOffcut }),
  };
}

/**
 * True when the woodworker has said whether they have this tool (on the pegboard, or when asked).
 */
export function toldAbout(record: ShopRecord, topic: ToolTopic): boolean {
  return record.setUp || record.told.includes(topic);
}

/** The record after the woodworker answered a question about `topic`. */
export function answered(record: ShopRecord, topic: ToolTopic): ShopRecord {
  return record.told.includes(topic) ? record : { ...record, told: [...record.told, topic] };
}
