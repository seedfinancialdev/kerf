// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The user's shop (Domain model, ShopProfile: "per user, not per project"), kept in the browser
// (ADR 015, D4; the pegboard record is ADR 016, D3) and checked by the engine's own rule before
// use.

import { type ShopProfile, shopProblem } from "@kerf/core";
import { recordFromProfile, type ShopRecord, STARTER_RECORD, shopProfileFor } from "./shop-record";
import { isShopRecord, shopRecordProblem } from "./shop-record-check";
import { STARTER_STOCK } from "./starter";
import type { AppStorage, StorageKey } from "./storage";

/** Said when the browser would not let the saved shop be read. */
const SHOP_UNREADABLE =
  "Your saved shop could not be read from this browser, so the starter shop is in use. Your " +
  "saved shop is left as it was.";

/** What `loadShop` gives: the shop to use, and what to say and guard about the saved one. */
export interface LoadedShop {
  record: ShopRecord;
  /** True only when nothing was saved and nothing could not be read. */
  firstLaunch: boolean;
  /** Why the saved shop is not in use, in shop words. */
  problem?: string;
  /**
   * True when the saved shop could not be used nor set aside: it is the only copy, so nothing may
   * write over it this visit (silent-failure review, I4).
   */
  keepOff?: true;
}

/** The set-aside keys in turn: `kerf.shop.setAside`, `kerf.shop.setAside.2`, … */
const asideKey = (n: number): StorageKey =>
  n === 1 ? "kerf.shop.setAside" : `kerf.shop.setAside.${n}`;

/**
 * Copies the unusable saved shop `text` to the first free set-aside key, so a later change to the
 * shop never destroys it; a copy already set aside is not made again. False when it could not be
 * written.
 */
function setAside(storage: AppStorage, text: string): boolean {
  let n = 1;
  for (let held = storage.read(asideKey(n)); held !== undefined; held = storage.read(asideKey(n))) {
    if (held === text) return true;
    n += 1;
  }
  return storage.write(asideKey(n), text);
}

/** The starter shop, with why the saved `text` could not be used, having set `text` aside. */
function unusable(storage: AppStorage, text: string, reason: string): LoadedShop {
  const said = `Your saved shop could not be used (${reason}), so the starter shop is in use.`;
  if (setAside(storage, text)) {
    return {
      record: STARTER_RECORD,
      firstLaunch: false,
      problem: `${said} It was set aside in this browser.`,
    };
  }
  return {
    record: STARTER_RECORD,
    firstLaunch: false,
    problem: `${said} It is left as it was, and changes to your shop won't be kept until it can be set aside.`,
    keepOff: true,
  };
}

/** Why `parsed` cannot be used as the shop, or undefined when it can. */
function whyUnusable(parsed: unknown): string | undefined {
  // A saved pegboard names its version; anything else is a version-1 `ShopProfile`.
  const isPegboard = typeof parsed === "object" && parsed !== null && "version" in parsed;
  if (isPegboard) {
    const problem = shopRecordProblem(parsed);
    if (problem) return problem;
  }
  const saved = isShopRecord(parsed) ? parsed : undefined;
  return shopProblem(saved ? shopProfileFor(saved) : parsed)?.message;
}

/**
 * The saved shop, or the starter shop with the reason the saved one could not be used. A shop
 * saved before the pegboard (a `ShopProfile`) is read as a set-up pegboard. A saved shop that
 * cannot be used is set aside first, and if it cannot be, `keepOff` says not to write over it.
 */
export function loadShop(storage: AppStorage): LoadedShop {
  // Without browser storage nothing can be kept, so asking again every load would never end (R10).
  if (!storage.available) return { record: STARTER_RECORD, firstLaunch: false };
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
    return unusable(storage, text, "it was damaged");
  }
  const problem = whyUnusable(parsed);
  if (problem) return unusable(storage, text, problem);
  return {
    record: isShopRecord(parsed) ? parsed : recordFromProfile(parsed as ShopProfile, STARTER_STOCK),
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
