// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3: New project "remembers the last piece, wood and units", so Create or Enter starts
// at once. The piece and wood are kept here; the units are the units for new projects (kerf.units),
// which Settings also sets, so there is one answer to "which units". What was kept is checked when
// read back: damaged text gives nothing, never a crash.

import { describe, expect, it } from "vitest";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { readLastChoice, writeLastChoice } from "./last-choice";
import { STOCK_IDS } from "./starter";
import { createStorage } from "./storage";

describe("readLastChoice()", () => {
  it("reads back the piece and wood written", () => {
    const storage = createStorage(memoryStorage());
    const choice = { piece: "cabinet", wood: STOCK_IDS.plywood34 } as const;
    expect(writeLastChoice(storage, choice)).toBe(true);
    expect(readLastChoice(storage)).toEqual(choice);
  });

  it("gives nothing when nothing was kept", () => {
    expect(readLastChoice(createStorage(memoryStorage()))).toEqual({});
  });

  it("gives nothing for text that is not a choice", () => {
    for (const text of ["not json", "[1,2]", "null", '"bookcase"']) {
      const backing = memoryStorage();
      backing.setItem("kerf.lastChoice", text);
      expect(readLastChoice(createStorage(backing)), text).toEqual({});
    }
  });

  it("keeps only the parts that are still good: no unknown piece, no piece that comes later", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.lastChoice", JSON.stringify({ piece: "table", wood: "w1" }));
    expect(readLastChoice(createStorage(backing))).toEqual({ wood: "w1" });
    backing.setItem("kerf.lastChoice", JSON.stringify({ piece: "rocket", wood: 7 }));
    expect(readLastChoice(createStorage(backing))).toEqual({});
    backing.setItem("kerf.lastChoice", JSON.stringify({ piece: "box", wood: "" }));
    expect(readLastChoice(createStorage(backing))).toEqual({ piece: "box" });
  });

  it("gives nothing when the browser will not let it be read", () => {
    const storage = createStorage(unreadable(["kerf.lastChoice"]));
    expect(readLastChoice(storage)).toEqual({});
  });
});

describe("writeLastChoice()", () => {
  it("says false when the browser cannot keep it", () => {
    const storage = createStorage(memoryStorage(true));
    expect(writeLastChoice(storage, { piece: "box", wood: "w1" })).toBe(false);
  });
});
