// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Shop and stock": the starter stock and shop are the reference fixtures' exactly.

import { loadProject, loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { STARTER_SHOP, STARTER_STOCK } from "./starter";

const withoutId = ({ id: _, ...rest }: { id: string }) => rest;

describe("starter stock and shop", () => {
  it("has the bookcase's plywood and the box's walnut, size for size", () => {
    const fixtures = [
      ...loadProject("bookcase", "structure").stock,
      ...loadProject("box", "structure").stock,
    ];
    const byName = new Map(fixtures.map((s) => [s.name, withoutId(s)]));
    for (const s of STARTER_STOCK) expect(withoutId(s)).toEqual(byName.get(s.name));
    expect(STARTER_STOCK.map((s) => s.name)).toEqual(["3/4 plywood", "1/4 plywood", "4/4 walnut"]);
  });

  it("is the reference shop profile", () => {
    expect(STARTER_SHOP).toEqual(loadShopProfile());
  });
});
