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
} as const satisfies Record<string, Id>;

const SHEET_4X8 = { length: 96 * IN, width: 48 * IN, grain: "along-length" } as const;

/** Copied into each new project, so a saved file always carries its own stock. */
export const STARTER_STOCK: readonly Stock[] = [
  {
    id: STOCK_IDS.plywood34,
    name: "3/4 plywood",
    kind: "sheet",
    thickness: (23 * IN) / 32,
    sheet: { ...SHEET_4X8 },
    allowance: { length: 0, width: 0 },
  },
  {
    id: STOCK_IDS.plywood14,
    name: "1/4 plywood",
    kind: "sheet",
    thickness: IN / 4,
    sheet: { ...SHEET_4X8 },
    allowance: { length: 0, width: 0 },
  },
  {
    id: STOCK_IDS.walnut44,
    name: "4/4 walnut",
    kind: "solid",
    thickness: IN / 2,
    solid: { standardLengths: [96 * IN], maxWidth: 8 * IN },
    allowance: { length: 0, width: IN / 4 },
  },
];

/** Which starter stock each form field uses when a template starts a project. */
export const STOCK_FOR: Partial<Record<(typeof STOCK_OPTIONS)[number], Id>> = {
  carcaseStock: STOCK_IDS.plywood34,
  backStock: STOCK_IDS.plywood14,
  wallStock: STOCK_IDS.walnut44,
  bottomStock: STOCK_IDS.plywood14,
};

/** 1/8" kerf, a dado stack up to 3/4", a router with a 1/8" roundover bit, dovetail hand tools. */
export const STARTER_SHOP: ShopProfile = {
  kerf: IN / 8,
  tools: [
    { type: "dadoStack", maxWidth: (3 * IN) / 4 },
    { type: "router", straightBits: [], roundoverBits: [IN / 8] },
    { type: "handTools", dovetails: true },
  ],
};
