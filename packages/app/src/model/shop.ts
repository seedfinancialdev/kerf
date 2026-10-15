// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The user's shop (Domain model, ShopProfile: "per user, not per project"), kept in the browser
// (ADR 015, D4; the pegboard record is ADR 016, D3) and checked by the engine's own rule before use.

import { type ShopProfile, shopProblem } from "@kerf/core";
import {
  recordFromProfile,
  type ShopRecord,
  STARTER_RECORD,
  shopProfileFor,
  type ToolTopic,
} from "./shop-record";
import { STARTER_STOCK } from "./starter";
import type { AppStorage } from "./storage";

/** Said when the browser would not let the saved shop be read. */
const SHOP_UNREADABLE =
  "Your saved shop could not be read from this browser, so the starter shop is in use. Your " +
  "saved shop is left as it was.";

const TOPICS: readonly string[] = ["saw", "dadoStack", "router", "handTools"] satisfies ToolTopic[];

const isRecord = (value: unknown): value is ShopRecord => {
  const r = value as Partial<ShopRecord> | null;
  return (
    typeof r === "object" &&
    r !== null &&
    r.version === 2 &&
    Array.isArray(r.stock) &&
    Array.isArray(r.told) &&
    r.told.every((t) => TOPICS.includes(t))
  );
};

const unusable = (reason: string) =>
  `Your saved shop could not be used (${reason}), so the starter shop is in use.`;

/**
 * The saved shop, or the starter shop with the reason the saved one could not be used. A shop
 * saved before the pegboard (a `ShopProfile`) is read as a set-up pegboard. `firstLaunch` is true
 * only when nothing was saved and nothing could not be read.
 */
export function loadShop(storage: AppStorage): {
  record: ShopRecord;
  firstLaunch: boolean;
  problem?: string;
} {
  const text = storage.read("kerf.shop");
  if (text === undefined) {
    // The storage does not write over a shop it could not read (`AppStorage.couldNotRead`).
    return storage.couldNotRead("kerf.shop")
      ? { record: STARTER_RECORD, firstLaunch: false, problem: SHOP_UNREADABLE }
      : { record: STARTER_RECORD, firstLaunch: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { record: STARTER_RECORD, firstLaunch: false, problem: unusable("it was damaged") };
  }
  const record = isRecord(parsed) ? parsed : undefined;
  const problem = shopProblem(record ? shopProfileFor(record) : parsed);
  if (problem)
    return { record: STARTER_RECORD, firstLaunch: false, problem: unusable(problem.message) };
  return {
    record: record ?? recordFromProfile(parsed as ShopProfile, STARTER_STOCK),
    firstLaunch: false,
  };
}

/** Shown once when the shop could not be written to browser storage (ADR 015, rule 11). */
export const SHOP_NOT_KEPT =
  "Your shop couldn't be kept in this browser; it applies until you close the page.";

/** Keeps the shop record in the browser; false when the browser would not take it. */
export function saveShop(storage: AppStorage, record: ShopRecord): boolean {
  return storage.write("kerf.shop", JSON.stringify(record));
}
