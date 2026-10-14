// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, D4: the shop lives in the browser; an unreadable one falls back to the starter shop
// and says so (CODE_QUALITY rule 9: no silent fallbacks).

import { describe, expect, it } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { loadShop, saveShop } from "./shop";
import { STARTER_SHOP } from "./starter";
import { createStorage } from "./storage";

const store = () => createStorage(memoryStorage());

describe("loadShop()", () => {
  it("gives the starter shop on first launch, with no problem", () => {
    expect(loadShop(store())).toEqual({ shop: STARTER_SHOP });
  });

  it("gives back a saved shop", () => {
    const s = store();
    const mine = { kerf: 23_813, tools: [{ type: "handTools" as const, dovetails: true }] };
    saveShop(s, mine);
    expect(loadShop(s)).toEqual({ shop: mine });
  });

  it("falls back to the starter shop and says why when the saved one is not valid", () => {
    const s = store();
    s.write("kerf.shop", JSON.stringify({ kerf: -1, tools: [] }));
    const loaded = loadShop(s);
    expect(loaded.shop).toEqual(STARTER_SHOP);
    expect(loaded.problem).toMatch(/^Your saved shop could not be used/);
  });

  it("falls back and says why when the saved text is not JSON", () => {
    const s = store();
    s.write("kerf.shop", "{not json");
    expect(loadShop(s).problem).toMatch(/^Your saved shop could not be used/);
  });
});
