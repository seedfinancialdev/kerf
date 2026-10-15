// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D7: Edge profile offers the roundovers whose bits are on the router card; the common
// roundovers without a bit greyed; chamfer, cove and ogee as Later (the engine draws roundovers only).

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { COMMON_ROUNDOVERS, edgeShapeOffers, withRouterBit } from "./edge-shapes";
import { STARTER_RECORD } from "./shop-record";

// 1/8" = 203200 / 8 = 25,400; 3/16" = 38,100; 1/4" = 50,800; 3/8" = 76,200; 1/2" = 101,600.
const EIGHTH = 25_400;
const QUARTER = 50_800;
const THREE_EIGHTHS = 76_200;
const HALF = 101_600;

describe("COMMON_ROUNDOVERS", () => {
  it('is 1/8", 1/4", 3/8" and 1/2", the sizes sold in a set', () => {
    expect(COMMON_ROUNDOVERS).toEqual([EIGHTH, QUARTER, THREE_EIGHTHS, HALF]);
  });
});

describe("edgeShapeOffers()", () => {
  it("offers the starter's 1/8\" roundover, the other common roundovers without a bit, and the rest later", () => {
    // Shapes not on the wall are shown at their smallest usual size, 1/4" for each (RouterBits sizes).
    expect(edgeShapeOffers(STARTER_RECORD)).toEqual([
      { shape: "roundover", size: EIGHTH, state: "owned" },
      { shape: "roundover", size: QUARTER, state: "noBit" },
      { shape: "roundover", size: THREE_EIGHTHS, state: "noBit" },
      { shape: "roundover", size: HALF, state: "noBit" },
      { shape: "chamfer", size: QUARTER, state: "later" },
      { shape: "cove", size: QUARTER, state: "later" },
      { shape: "ogee", size: QUARTER, state: "later" },
    ]);
  });

  it("lists a chamfer bit on the wall as later, at its own size", () => {
    const record = {
      ...STARTER_RECORD,
      router: { bits: [{ shape: "chamfer" as const, size: (3 * INCH) / 8 }] },
    };
    const chamfers = edgeShapeOffers(record).filter((o) => o.shape === "chamfer");
    expect(chamfers).toEqual([{ shape: "chamfer", size: THREE_EIGHTHS, state: "later" }]);
  });

  it("lists every roundover bit owned first, smallest first, uncommon sizes included", () => {
    const record = {
      ...STARTER_RECORD,
      router: {
        bits: [
          { shape: "roundover" as const, size: (3 * INCH) / 8 },
          { shape: "roundover" as const, size: (3 * INCH) / 16 },
        ],
      },
    };
    const roundovers = edgeShapeOffers(record).filter((o) => o.shape === "roundover");
    expect(roundovers).toEqual([
      { shape: "roundover", size: 38_100, state: "owned" },
      { shape: "roundover", size: THREE_EIGHTHS, state: "owned" },
      { shape: "roundover", size: EIGHTH, state: "noBit" },
      { shape: "roundover", size: QUARTER, state: "noBit" },
      { shape: "roundover", size: HALF, state: "noBit" },
    ]);
  });

  it("offers every common roundover without a bit when the shop has no router", () => {
    const offers = edgeShapeOffers({ ...STARTER_RECORD, router: null });
    expect(offers.filter((o) => o.state === "noBit").map((o) => o.size)).toEqual([
      EIGHTH,
      QUARTER,
      THREE_EIGHTHS,
      HALF,
    ]);
    expect(offers.some((o) => o.state === "owned")).toBe(false);
  });

  it("never offers straight or rabbeting bits, which cut joints, not edges", () => {
    const record = {
      ...STARTER_RECORD,
      router: {
        bits: [
          { shape: "straight" as const, size: INCH / 2 },
          { shape: "rabbeting" as const, size: (3 * INCH) / 8 },
        ],
      },
    };
    expect(edgeShapeOffers(record).map((o) => o.shape)).not.toContain("straight");
    expect(edgeShapeOffers(record).map((o) => o.shape)).not.toContain("rabbeting");
  });
});

describe("withRouterBit()", () => {
  it("adds the bit to the router card and keeps the router as told", () => {
    const bit = { shape: "roundover" as const, size: THREE_EIGHTHS };
    const record = withRouterBit(STARTER_RECORD, bit);
    expect(record.router?.bits).toEqual([{ shape: "roundover", size: EIGHTH }, bit]);
    expect(record.told).toEqual(["router"]);
  });

  it("hangs a router holding just that bit when the shop had none", () => {
    const bit = { shape: "roundover" as const, size: QUARTER };
    expect(withRouterBit({ ...STARTER_RECORD, router: null }, bit).router).toEqual({ bits: [bit] });
  });

  it("leaves the record alone when the router already has the bit", () => {
    const record = { ...STARTER_RECORD, told: ["router" as const] };
    expect(withRouterBit(record, { shape: "roundover", size: EIGHTH })).toBe(record);
  });
});
