// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a new user starts with (design spec, "Shop and stock"): the reference projects' stock and
// the reference shop profile, so the first bookcase matches the golden cut list exactly.

import type { Id, ShopProfile, STOCK_OPTIONS, Stock } from "@kerf/core";

const IN = 203_200;

export const STOCK_IDS = {
  plywood34: "01K7M4AP000000000000000001",
  plywood14: "01K7M4AP000000000000000002",
  walnut44: "01K7M4AP000000000000000003",
  plywood18mm: "01K7M4AP000000000000000004",
} as const satisfies Record<string, Id>;

const SHEET_4X8 = { length: 96 * IN, width: 48 * IN, grain: "along-length" } as const;

const PLYWOOD_3_4: Stock = {
  id: STOCK_IDS.plywood34,
  name: "3/4 plywood",
  kind: "sheet",
  thickness: (23 * IN) / 32,
  sheet: { ...SHEET_4X8 },
  allowance: { length: 0, width: 0 },
};

const PLYWOOD_1_4: Stock = {
  id: STOCK_IDS.plywood14,
  name: "1/4 plywood",
  kind: "sheet",
  thickness: IN / 4,
  sheet: { ...SHEET_4X8 },
  allowance: { length: 0, width: 0 },
};

const WALNUT_4_4: Stock = {
  id: STOCK_IDS.walnut44,
  name: "4/4 walnut",
  kind: "solid",
  thickness: IN / 2,
  solid: { standardLengths: [96 * IN], maxWidth: 8 * IN },
  allowance: { length: 0, width: IN / 4 },
};

const MM = 8_000;

/**
 * The metric project's plywood (ADR 015, rule 4): the 3/4 plywood's 23/32" is not a whole number
 * of 0.01 mm steps, so it is replaced by 18 mm (144,000 units). The 1/4 plywood and the walnut
 * are on both grids.
 */
const PLYWOOD_18_MM: Stock = {
  id: STOCK_IDS.plywood18mm,
  name: "18 mm plywood",
  kind: "sheet",
  thickness: 18 * MM,
  sheet: { ...SHEET_4X8 },
  allowance: { length: 0, width: 0 },
};

/** Copied into each new project, so a saved file always carries its own stock. */
export const STARTER_STOCK: readonly Stock[] = [PLYWOOD_3_4, PLYWOOD_1_4, WALNUT_4_4];

/** The stock a new metric project carries. */
export const METRIC_STARTER_STOCK: readonly Stock[] = [PLYWOOD_18_MM, PLYWOOD_1_4, WALNUT_4_4];

/** The starter stock a new project in `units` carries. */
export function starterStockFor(units: "imperial" | "metric"): readonly Stock[] {
  return units === "metric" ? METRIC_STARTER_STOCK : STARTER_STOCK;
}

/** Which starter stock each form field uses when a template starts a project. */
export const STOCK_FOR: Partial<Record<(typeof STOCK_OPTIONS)[number], Id>> = {
  carcaseStock: STOCK_IDS.plywood34,
  backStock: STOCK_IDS.plywood14,
  wallStock: STOCK_IDS.walnut44,
  bottomStock: STOCK_IDS.plywood14,
};

/** The `STOCK_FOR` mapping for a project in `units`: the case's carcase is the 18 mm plywood in metric. */
export function stockForUnits(units: "imperial" | "metric"): typeof STOCK_FOR {
  return units === "metric" ? { ...STOCK_FOR, carcaseStock: STOCK_IDS.plywood18mm } : STOCK_FOR;
}

/** 1/8" kerf, a dado stack up to 3/4", a router with a 1/8" roundover bit, dovetail hand tools. */
export const STARTER_SHOP: ShopProfile = {
  kerf: IN / 8,
  tools: [
    { type: "dadoStack", maxWidth: (3 * IN) / 4 },
    { type: "router", straightBits: [], roundoverBits: [IN / 8] },
    { type: "handTools", dovetails: true },
  ],
};
