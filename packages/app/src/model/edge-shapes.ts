// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Router bits are edge shapes (design spec, "Router bits and edge shapes"; ADR 016, D7): one list
// seen from two places. Edge profile offers the roundovers whose bits are on the router card, the
// common roundovers without a bit greyed (with an offer to add the bit), and chamfer, cove and ogee
// as Later, because the engine draws roundovers only.

import type { Len } from "@kerf/core";
import {
  answered,
  type BitShape,
  type RouterBit,
  type ShopRecord,
  USUAL_BIT_SIZES,
} from "./shop-record";

/** One shape Edge profile shows, and whether it can be used now. */
export interface EdgeShapeOffer {
  shape: BitShape;
  /** The bit's radius, in project units. */
  size: Len;
  /**
   * `owned`: the bit is on the router card; `noBit`: the engine can cut it but the shop has no bit;
   * `later`: the engine cannot cut this shape yet.
   */
  state: "owned" | "noBit" | "later";
}

/**
 * The roundover radii offered without a bit: the sizes sold in a set, 1/8", 1/4", 3/8" and 1/2".
 */
export const COMMON_ROUNDOVERS: readonly Len[] = USUAL_BIT_SIZES.roundover;

/** Edge shapes the engine cannot cut yet (ADR 016, D7), in the order Edge profile lists them. */
const LATER_SHAPES = ["chamfer", "cove", "ogee"] as const satisfies readonly BitShape[];

const sizesOwned = (record: ShopRecord, shape: BitShape): Len[] =>
  (record.router?.bits ?? [])
    .filter((b) => b.shape === shape)
    .map((b) => b.size)
    .sort((a, b) => a - b);

/**
 * Every shape Edge profile offers for `record`: the roundovers owned (smallest first), then the
 * common roundovers without a bit, then chamfer, cove and ogee as later — each at the sizes on the
 * wall, or at its smallest usual size when the wall has none. Straight and rabbeting bits cut
 * joints, not edges, and are not offered.
 */
export function edgeShapeOffers(record: ShopRecord): EdgeShapeOffer[] {
  const owned = sizesOwned(record, "roundover");
  const later = LATER_SHAPES.flatMap((shape) => {
    const sizes = sizesOwned(record, shape);
    const shown = sizes.length > 0 ? sizes : USUAL_BIT_SIZES[shape].slice(0, 1);
    return shown.map((size) => ({ shape, size, state: "later" as const }));
  });
  return [
    ...owned.map((size) => ({ shape: "roundover" as const, size, state: "owned" as const })),
    ...COMMON_ROUNDOVERS.filter((size) => !owned.includes(size)).map((size) => ({
      shape: "roundover" as const,
      size,
      state: "noBit" as const,
    })),
    ...later,
  ];
}

/**
 * The record with `bit` on the router card, hanging a router if the shop had none. Owning a bit
 * says the shop has a router, so the router counts as told (ADR 016, D4). Unchanged if the bit
 * is already there.
 */
export function withRouterBit(record: ShopRecord, bit: RouterBit): ShopRecord {
  const bits = record.router?.bits ?? [];
  if (bits.some((b) => b.shape === bit.shape && b.size === bit.size)) return record;
  return answered({ ...record, router: { bits: [...bits, bit] } }, "router");
}
