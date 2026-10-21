// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D8: every end-to-end spec starts as a returning user, from a seed written by hand
// (playwright.config.ts). The seed must stay the starter shop, set up, so every spec plans with
// STARTER_SHOP, the reference shop the golden bookcase was measured against.

import { describe, expect, it } from "vitest";
import seed from "../../e2e/support/returning-user.json";
import { loadShop } from "../model/shop";
import { STARTER_RECORD, shopProfileFor } from "../model/shop-record";
import { STARTER_SHOP } from "../model/starter";
import { createStorage } from "../model/storage";
import { memoryStorage } from "./memory-storage";

/** The value the seed keeps under `name` in the app's browser storage. */
function seeded(name: string): string | undefined {
  return seed.origins[0]?.localStorage.find((item) => item.name === name)?.value;
}

/** The shop the app reads from a browser holding the seed. */
function shopRead() {
  const backing = memoryStorage();
  for (const { name, value } of seed.origins[0]?.localStorage ?? []) backing.setItem(name, value);
  return loadShop(createStorage(backing));
}

describe("the returning user's seed", () => {
  it("keeps the starter shop, set up", () => {
    expect(JSON.parse(seeded("kerf.shop") ?? "null")).toEqual({ ...STARTER_RECORD, setUp: true });
  });

  it("is read by the app as it is, and gives the engine the starter shop", () => {
    const { record, problem } = shopRead();
    expect(problem).toBeUndefined();
    expect(record).toEqual({ ...STARTER_RECORD, setUp: true });
    expect(shopProfileFor(record)).toEqual(STARTER_SHOP);
  });

  it("has seen the tour", () => {
    expect(seeded("kerf.toured")).toBe("yes");
  });
});
