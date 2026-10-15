// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D3: the pegboard keeps every tool; the engine gets only what it understands.

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import {
  answered,
  recordFromProfile,
  STARTER_RECORD,
  shopProfileFor,
  toldAbout,
} from "./shop-record";
import { STARTER_SHOP, STARTER_STOCK } from "./starter";

describe("shopProfileFor()", () => {
  it("gives the starter record exactly today's starter shop", () => {
    expect(shopProfileFor(STARTER_RECORD)).toEqual(STARTER_SHOP);
  });

  it('takes the cut width from the table saw, else the track saw, else 1/8"', () => {
    const thin = { ...STARTER_RECORD, tableSaw: { kerf: (3 * INCH) / 32 } };
    expect(shopProfileFor(thin).kerf).toBe(19_050); // 3/32" = 3 × 203200 / 32
    const track = { ...STARTER_RECORD, tableSaw: null, trackSaw: { kerf: INCH / 16 } };
    expect(shopProfileFor(track).kerf).toBe(12_700); // 1/16" = 203200 / 16
    const none = { ...STARTER_RECORD, tableSaw: null, trackSaw: null };
    expect(shopProfileFor(none).kerf).toBe(25_400); // 1/8" = 203200 / 8
  });

  it("passes router bits by shape and leaves out shapes the engine does not use", () => {
    const record = {
      ...STARTER_RECORD,
      router: {
        bits: [
          { shape: "roundover" as const, size: INCH / 4 },
          { shape: "chamfer" as const, size: INCH / 4 },
          { shape: "straight" as const, size: INCH / 2 },
        ],
      },
    };
    expect(shopProfileFor(record).tools).toContainEqual({
      type: "router",
      straightBits: [101_600], // 1/2"
      roundoverBits: [50_800], // 1/4"
    });
  });

  it("cuts dovetails by hand only with both chisels and a dovetail saw", () => {
    const sawOnly = { ...STARTER_RECORD, chisels: false };
    expect(shopProfileFor(sawOnly).tools).not.toContainEqual({
      type: "handTools",
      dovetails: true,
    });
  });

  it("leaves out a dado stack and a router the shop does not have", () => {
    const bare = { ...STARTER_RECORD, dadoStack: null, router: null, chisels: false };
    expect(shopProfileFor(bare).tools).toEqual([{ type: "handTools", dovetails: false }]);
  });
});

describe("recordFromProfile()", () => {
  it("reads a saved version-1 shop as set up, keeping every value", () => {
    const record = recordFromProfile(STARTER_SHOP, STARTER_STOCK);
    expect(record.setUp).toBe(true);
    expect(shopProfileFor(record)).toEqual(STARTER_SHOP);
  });

  it("keeps the trims and smallest offcut of a saved version-1 shop", () => {
    const profile = { ...STARTER_SHOP, sheetTrim: 1_000, solidTrim: 2_000, minOffcut: 3_000 };
    expect(shopProfileFor(recordFromProfile(profile, STARTER_STOCK))).toEqual(profile);
  });

  it("keeps a version-1 shop with no dado stack, no router and no hand-cut dovetails", () => {
    const profile = { kerf: 19_050, tools: [{ type: "handTools" as const, dovetails: false }] };
    const record = recordFromProfile(profile, STARTER_STOCK);
    expect(record.dadoStack).toBeNull();
    expect(record.router).toBeNull();
    expect(shopProfileFor(record)).toEqual(profile);
  });
});

describe("toldAbout() / answered()", () => {
  it("knows nothing after a skip, everything after the pegboard, and one topic once answered", () => {
    expect(toldAbout(STARTER_RECORD, "dadoStack")).toBe(false);
    expect(toldAbout({ ...STARTER_RECORD, setUp: true }, "dadoStack")).toBe(true);
    expect(toldAbout(answered(STARTER_RECORD, "dadoStack"), "dadoStack")).toBe(true);
    expect(toldAbout(answered(STARTER_RECORD, "dadoStack"), "router")).toBe(false);
  });
});
