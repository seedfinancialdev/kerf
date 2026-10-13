// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The user's shop (Domain model, ShopProfile: "per user, not per project"), kept in the browser
// (ADR 015, D4) and checked by the engine's own rule before use.

import { type ShopProfile, shopProblem } from "@kerf/core";
import { STARTER_SHOP } from "./starter";
import type { AppStorage } from "./storage";

/** Said when the browser would not let the saved shop be read. */
const SHOP_UNREADABLE =
  "Your saved shop could not be read from this browser, so the starter shop is in use. Your " +
  "saved shop is left as it was.";

/** The saved shop, or the starter shop with the reason the saved one could not be used. */
export function loadShop(storage: AppStorage): { shop: ShopProfile; problem?: string } {
  const text = storage.read("kerf.shop");
  if (text === undefined) {
    // The storage does not write over a shop it could not read (`AppStorage.couldNotRead`).
    return storage.couldNotRead("kerf.shop")
      ? { shop: STARTER_SHOP, problem: SHOP_UNREADABLE }
      : { shop: STARTER_SHOP };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      shop: STARTER_SHOP,
      problem: "Your saved shop could not be used (it was damaged), so the starter shop is in use.",
    };
  }
  const problem = shopProblem(parsed);
  if (problem)
    return {
      shop: STARTER_SHOP,
      problem: `Your saved shop could not be used (${problem.message}), so the starter shop is in use.`,
    };
  return { shop: parsed as ShopProfile };
}

/** Shown once when the shop could not be written to browser storage (ADR 015, rule 11). */
export const SHOP_NOT_KEPT =
  "Your shop couldn't be kept in this browser; it applies until you close the page.";

/** Keeps the shop in the browser; false when the browser would not take it. */
export function saveShop(storage: AppStorage, shop: ShopProfile): boolean {
  return storage.write("kerf.shop", JSON.stringify(shop));
}
