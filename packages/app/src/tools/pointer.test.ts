// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, Select: a click picks a board, Shift adds, empty space picks nothing.

import type { PlacedPart } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { handlerFor, type ModelHit } from "./pointer";

const hitOn = (instance: string): ModelHit => ({
  placed: { instance } as PlacedPart,
  point: [0, 0, 0],
  normal: [0, 0, 1],
});
const store = () => createKerfStore({ storage: createStorage(memoryStorage()) });
const click = (s: ReturnType<typeof store>, hit: ModelHit | null, shift = false) =>
  handlerFor("select").pointer?.({ kind: "down", hit, shift, ctrl: false }, s);

describe("the Select tool", () => {
  it("picks the board clicked, replacing the pick", () => {
    const s = store();
    click(s, hitOn("a"));
    click(s, hitOn("b"));
    expect(s.getState().selection).toEqual({ kind: "boards", instances: ["b"] });
  });

  it("adds a board to the pick with Shift", () => {
    const s = store();
    click(s, hitOn("a"));
    click(s, hitOn("b"), true);
    expect(s.getState().selection).toEqual({ kind: "boards", instances: ["a", "b"] });
  });

  it("picks nothing when empty space is clicked", () => {
    const s = store();
    click(s, hitOn("a"));
    click(s, null);
    expect(s.getState().selection).toEqual({ kind: "none" });
  });
});
