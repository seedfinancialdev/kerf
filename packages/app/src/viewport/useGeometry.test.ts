// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The view and every inspector share one load of the geometry engine,
// and a failed load is not tried again in silence by each screen that mounts later.

import { describe, expect, it } from "vitest";
import { shareLoad } from "./useGeometry";

describe("shareLoad()", () => {
  it("starts the load once however many screens ask while it is still going", async () => {
    let loads = 0;
    const load = shareLoad(async () => {
      loads += 1;
    });
    await Promise.all([load(), load(), load()]);
    expect(loads).toBe(1);
  });

  it("keeps a failed load, so a later screen hears the same failure without a new attempt", async () => {
    let loads = 0;
    const load = shareLoad(async () => {
      loads += 1;
      throw new Error("no WebAssembly");
    });
    await expect(load()).rejects.toThrow("no WebAssembly");
    await expect(load()).rejects.toThrow("no WebAssembly");
    expect(loads).toBe(1);
  });
});
