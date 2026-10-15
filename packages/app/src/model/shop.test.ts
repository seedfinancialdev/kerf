// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, D4 and ADR 016, D3: the shop lives in the browser; an unreadable one falls back to the
// starter shop and says so (CODE_QUALITY rule 9: no silent fallbacks).

import { describe, expect, it } from "vitest";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { loadShop, saveShop } from "./shop";
import { STARTER_RECORD } from "./shop-record";
import { createStorage } from "./storage";

const store = () => createStorage(memoryStorage());

describe("loadShop()", () => {
  it("gives the starter record on first launch, with no problem", () => {
    expect(loadShop(store())).toEqual({ record: STARTER_RECORD, firstLaunch: true });
  });

  it("reads a saved version-1 shop as a set-up pegboard", () => {
    const s = store();
    const mine = { kerf: 23_813, tools: [{ type: "handTools" as const, dovetails: true }] };
    s.write("kerf.shop", JSON.stringify(mine));
    const loaded = loadShop(s);
    expect(loaded.firstLaunch).toBe(false);
    expect(loaded.record.setUp).toBe(true);
    expect(loaded.record.tableSaw).toEqual({ kerf: 23_813 });
    expect(loaded.problem).toBeUndefined();
  });

  it("gives back a saved record", () => {
    const s = store();
    const mine = { ...STARTER_RECORD, setUp: true, told: ["router" as const] };
    saveShop(s, mine);
    expect(loadShop(s)).toEqual({ record: mine, firstLaunch: false });
  });

  it("falls back to the starter record and says why when the saved shop is not valid", () => {
    const s = store();
    s.write("kerf.shop", JSON.stringify({ kerf: -1, tools: [] }));
    const loaded = loadShop(s);
    expect(loaded.record).toEqual(STARTER_RECORD);
    expect(loaded.firstLaunch).toBe(false);
    expect(loaded.problem).toMatch(/^Your saved shop could not be used/);
  });

  it("falls back and says why when a saved record's cut width is negative", () => {
    const s = store();
    saveShop(s, { ...STARTER_RECORD, tableSaw: { kerf: -1 } });
    const loaded = loadShop(s);
    expect(loaded.record).toEqual(STARTER_RECORD);
    expect(loaded.problem).toMatch(/^Your saved shop could not be used/);
  });

  it("falls back when a saved record's stock or told list is not a list", () => {
    const s = store();
    s.write("kerf.shop", JSON.stringify({ ...STARTER_RECORD, stock: "oak" }));
    expect(loadShop(s).record).toEqual(STARTER_RECORD);
    s.write("kerf.shop", JSON.stringify({ ...STARTER_RECORD, told: ["lathe"] }));
    expect(loadShop(s).problem).toMatch(/^Your saved shop could not be used/);
  });

  it("falls back and says why when the saved text is not JSON", () => {
    const s = store();
    s.write("kerf.shop", "{not json");
    const loaded = loadShop(s);
    expect(loaded.record).toEqual(STARTER_RECORD);
    expect(loaded.firstLaunch).toBe(false);
    expect(loaded.problem).toBe(
      "Your saved shop could not be used (it was damaged), so the starter shop is in use.",
    );
  });

  it("uses the starter record and says so when the browser would not let the shop be read", () => {
    const loaded = loadShop(createStorage(unreadable(["kerf.shop"])));
    expect(loaded.record).toEqual(STARTER_RECORD);
    expect(loaded.firstLaunch).toBe(false);
    expect(loaded.problem).toMatch(/^Your saved shop could not be read from this browser/);
  });
});
