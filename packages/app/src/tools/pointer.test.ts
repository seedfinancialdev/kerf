// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, Select: a click picks a board, Shift adds, empty space picks nothing.

import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { handlerFor, type ModelHit } from "./pointer";

const store = () => {
  const s = createKerfStore({ storage: createStorage(memoryStorage()) });
  s.getState().apply(startProject("Bookcase", "imperial"));
  return s;
};
/** A click on the bookcase's board with this name. */
const hitOn = (name: "Top" | "Bottom"): ModelHit => {
  const placed = store()
    .getState()
    .solved?.result.placements.find((p) => p.partName === name);
  if (!placed) throw new Error(`no ${name}`);
  return { placed, point: [0, 0, 0], normal: placed.frame.z };
};
const id = (name: "Top" | "Bottom") => hitOn(name).placed.instance;
const click = (s: ReturnType<typeof store>, hit: ModelHit | null, shift = false) =>
  handlerFor("select").pointer?.({ kind: "down", hit, ray: null, shift, ctrl: false }, s);

describe("the Select tool", () => {
  it("picks the board clicked, replacing the pick", () => {
    const s = store();
    click(s, hitOn("Top"));
    click(s, hitOn("Bottom"));
    expect(s.getState().selection).toEqual({ kind: "boards", instances: [id("Bottom")] });
  });

  it("adds a board to the pick with Shift", () => {
    const s = store();
    click(s, hitOn("Top"));
    click(s, hitOn("Bottom"), true);
    expect(s.getState().selection).toEqual({
      kind: "boards",
      instances: [id("Top"), id("Bottom")],
    });
  });

  it("picks nothing when empty space is clicked", () => {
    const s = store();
    click(s, hitOn("Top"));
    click(s, null);
    expect(s.getState().selection).toEqual({ kind: "none" });
  });
});
