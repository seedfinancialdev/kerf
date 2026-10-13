// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: storage never throws; when it cannot work it says so once.

import { describe, expect, it } from "vitest";
import { memoryStorage as memory, unreadable } from "../testing/memory-storage";
import { createStorage } from "./storage";

describe("createStorage()", () => {
  it("reads back what it wrote", () => {
    const s = createStorage(memory());
    expect(s.write("kerf.units", "metric")).toBe(true);
    expect(s.read("kerf.units")).toBe("metric");
  });

  it("is unavailable, and never throws, when the browser has no storage", () => {
    const s = createStorage(undefined);
    expect(s.available).toBe(false);
    expect(s.write("kerf.units", "metric")).toBe(false);
    expect(s.read("kerf.units")).toBeUndefined();
  });

  it("reports a failed write when storage is full", () => {
    expect(createStorage(memory(true)).write("kerf.project", "{}")).toBe(false);
  });

  it("returns undefined for a key never written", () => {
    expect(createStorage(memory()).read("kerf.theme")).toBeUndefined();
  });

  describe("when a key cannot be read", () => {
    it("says so, and does not write over what the key holds", () => {
      const backing = unreadable(["kerf.project"]);
      backing.setItem("kerf.project", "the last project");
      const s = createStorage(backing);
      expect(s.read("kerf.project")).toBeUndefined();
      expect(s.couldNotRead("kerf.project")).toBe(true);
      expect(s.write("kerf.project", "a new project")).toBe(false);
      s.remove("kerf.project");
      backing.readable(true);
      expect(backing.getItem("kerf.project")).toBe("the last project");
    });

    it("writes the key again once a read of it has worked", () => {
      const backing = unreadable(["kerf.project"]);
      const s = createStorage(backing);
      s.read("kerf.project");
      backing.readable(true);
      expect(s.read("kerf.project")).toBeUndefined();
      expect(s.couldNotRead("kerf.project")).toBe(false);
      expect(s.write("kerf.project", "a new project")).toBe(true);
    });

    it("keeps writing the keys it could read", () => {
      const s = createStorage(unreadable(["kerf.project"]));
      s.read("kerf.project");
      expect(s.couldNotRead("kerf.units")).toBe(false);
      expect(s.write("kerf.units", "metric")).toBe(true);
    });
  });
});
