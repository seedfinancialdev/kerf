// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "The flow": the workshop's steps become Shape → Divide → Joinery → Build plan; the
// Start step leaves the top bar, its jobs moving to New project, Home and Your shop.

import { describe, expect, it } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { STEPS } from "./steps";
import { createStorage } from "./storage";
import { createKerfStore } from "./store";

describe("STEPS", () => {
  it("are Shape, Divide, Joinery and Build plan, in that order", () => {
    expect(STEPS).toEqual(["Shape", "Divide", "Joinery", "Build plan"]);
  });

  it("start a new store on Shape", () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    expect(store.getState().step).toBe("Shape");
  });
});
