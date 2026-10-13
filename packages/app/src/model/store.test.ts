// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "How it is built": every change is one named command; the engine solves after each;
// a drag previews and records once (ADR 015, rule 2). Numbers: Operation specs, bookcase.

import { describe, expect, it } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { setSize, startProject } from "./commands";
import { createStorage } from "./storage";
import { createKerfStore, shownProject } from "./store";

const fresh = () => createKerfStore({ storage: createStorage(memoryStorage()) });
const shelfCut = (s: ReturnType<typeof fresh>) =>
  s.getState().solved?.result.cutList.lines.find((l) => l.parts.some((p) => p.name === "Shelf"))
    ?.length;

describe("createKerfStore()", () => {
  it("starts with no project, on the Start step", () => {
    const s = fresh().getState();
    expect(s.history).toBeNull();
    expect(s.step).toBe("Start");
  });

  it("solves the bookcase as soon as it is started: shelves 35-1/16 cut", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    expect(shelfCut(s)).toBe(7_124_700);
    expect(s.getState().solved?.assembly).toHaveLength(4);
  });

  it('records Width 36" → 30" as one entry and re-solves: shelves 29-1/16 cut', () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    const r = setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r.ok) throw new Error(r.message);
    s.getState().apply(r.edit);
    expect(s.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 30"',
    ]);
    expect(shelfCut(s)).toBe(5_905_500);
  });

  it('undoes back to 36" and re-solves', () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    const r = p && setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r?.ok) throw new Error("resize failed");
    s.getState().apply(r.edit);
    s.getState().undo();
    expect(shelfCut(s)).toBe(7_124_700);
  });

  it("records one entry for a drag of 200 previews, ending exactly on the last value", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const base = shownProject(s.getState());
    if (!base) throw new Error("no project");
    const id = base.structures[0]?.id ?? "";
    let last = base;
    for (let step = 1; step <= 200; step += 1) {
      // 36" minus 200 steps of 1/64" = 36 − 3-1/8 = 32-7/8".
      const r = setSize(base, id, "w", `36in - ${step}in/64`);
      if (!r.ok) throw new Error(r.message);
      last = r.edit.project;
      s.getState().preview(last);
    }
    s.getState().commit('Width 36" → 32-7/8"');
    expect(s.getState().history?.entries).toHaveLength(2);
    expect(shownProject(s.getState())).toEqual(last);
    // 32-7/8 − 2 × 23/32 + 2 × 1/4 = 31-15/16" = 31 × 203200 + 15/16 × 203200 = 6489700.
    expect(shelfCut(s)).toBe(6_489_700);
  });

  it("cancels a preview and shows the recorded project again", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const base = shownProject(s.getState());
    const r = base && setSize(base, base.structures[0]?.id ?? "", "w", '30"');
    if (!r?.ok) throw new Error("resize failed");
    s.getState().preview(r.edit.project);
    s.getState().cancelPreview();
    expect(shelfCut(s)).toBe(7_124_700);
    expect(s.getState().history?.entries).toHaveLength(1);
  });

  it("shows a notice with the change when one is given", () => {
    const s = fresh();
    s.getState().apply(
      startProject("Bookcase", "imperial"),
      "Shelf 3 is now custom; the form won't change it",
    );
    expect(s.getState().notice).toEqual({
      text: "Shelf 3 is now custom; the form won't change it",
      undo: true,
    });
  });
});
