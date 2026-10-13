// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "How it is built": every change is one named command; the engine solves after each;
// a drag previews and records once (ADR 015, rule 2). Numbers: Operation specs, bookcase.

import { describe, expect, it } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { setSize, startProject } from "./commands";
import { STARTER_SHOP } from "./starter";
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

  describe("notices (ruling R13)", () => {
    const custom = "Shelf 3 is now custom; the form won't change it";
    const withNotice = () => {
      const s = fresh();
      s.getState().apply(startProject("Bookcase", "imperial"));
      const p = shownProject(s.getState());
      const r = p && setSize(p, p.structures[0]?.id ?? "", "w", '30"');
      if (!r?.ok) throw new Error("resize failed");
      return { s, edit: r.edit, p };
    };

    it("clears an Undo notice when the next change is applied", () => {
      const { s, edit } = withNotice();
      s.getState().apply(edit, custom);
      const next = setSize(edit.project, edit.project.structures[0]?.id ?? "", "w", '24"');
      if (!next.ok) throw new Error(next.message);
      s.getState().apply(next.edit);
      expect(s.getState().notice).toBeNull();
    });

    it("clears an Undo notice on redo, jumpTo and commit", () => {
      const { s, edit } = withNotice();
      s.getState().apply(edit, custom);
      s.getState().undo();
      s.getState().say(custom, true);
      s.getState().redo();
      expect(s.getState().notice).toBeNull();
      s.getState().say(custom, true);
      s.getState().jumpTo(0);
      expect(s.getState().notice).toBeNull();
      s.getState().say(custom, true);
      s.getState().preview(edit.project);
      s.getState().commit('Width 36" → 30"');
      expect(s.getState().notice).toBeNull();
    });

    it("keeps a plain notice through changes until it is dismissed", () => {
      const { s, edit } = withNotice();
      s.getState().say("plain");
      s.getState().apply(edit);
      expect(s.getState().notice).toEqual({ text: "plain", undo: false });
      s.getState().dismissNotice();
      expect(s.getState().notice).toBeNull();
    });
  });

  it("solves again on redo: shelves 29-1/16 cut", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    const r = p && setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r?.ok) throw new Error("resize failed");
    s.getState().apply(r.edit);
    s.getState().undo();
    s.getState().redo();
    expect(shelfCut(s)).toBe(5_905_500);
  });

  it("solves again on jumpTo(0): shelves 35-1/16 cut", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    const r = p && setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r?.ok) throw new Error("resize failed");
    s.getState().apply(r.edit);
    s.getState().jumpTo(0);
    expect(shelfCut(s)).toBe(7_124_700);
  });

  it("solves again with a new shop and saves it: with no tools every cut is missing", () => {
    const storage = createStorage(memoryStorage());
    const s = createKerfStore({ storage });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const cuts = () => s.getState().solved?.result.joints.flatMap((j) => j.cuts) ?? [];
    expect(cuts().some((c) => !c.missing)).toBe(true);
    s.getState().setShop({ kerf: 0, tools: [] });
    expect(cuts().length).toBeGreaterThan(0);
    expect(cuts().every((c) => c.missing)).toBe(true);
    expect(storage.read("kerf.shop")).toBe(JSON.stringify({ kerf: 0, tools: [] }));
  });

  it("falls back to the starter shop with a plain notice when the saved shop is invalid", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.shop", JSON.stringify({ kerf: 0 }));
    const s = createKerfStore({ storage: createStorage(backing) }).getState();
    expect(s.shop).toEqual(STARTER_SHOP);
    expect(s.notice?.undo).toBe(false);
    expect(s.notice?.text.startsWith("Your saved shop could not be used")).toBe(true);
  });

  it("saves the theme", () => {
    const storage = createStorage(memoryStorage());
    const s = createKerfStore({ storage });
    s.getState().setTheme("light");
    expect(s.getState().theme).toBe("light");
    expect(storage.read("kerf.theme")).toBe("light");
  });

  it("times the solve with the clock it is given: 25 − 10 = 15 ms", () => {
    const ticks = [10, 25];
    const s = createKerfStore({
      storage: createStorage(memoryStorage()),
      clock: () => ticks.shift() ?? 0,
    });
    s.getState().apply(startProject("Bookcase", "imperial"));
    expect(s.getState().solved?.ms).toBe(15);
  });

  it("ignores a commit when nothing is previewed", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const before = s.getState().history;
    s.getState().commit("Nothing");
    expect(s.getState().history).toBe(before);
  });

  it("drops the preview on undo and shows the previous entry", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    const r = p && setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r?.ok) throw new Error("resize failed");
    s.getState().apply(r.edit);
    const dragged = setSize(r.edit.project, r.edit.project.structures[0]?.id ?? "", "w", '24"');
    if (!dragged.ok) throw new Error(dragged.message);
    s.getState().preview(dragged.edit.project);
    s.getState().undo();
    expect(s.getState().previewed).toBeNull();
    expect(shelfCut(s)).toBe(7_124_700);
  });
});
