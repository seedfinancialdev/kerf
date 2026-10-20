// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "How it is built": every change is one named command; the engine solves after each;
// a drag previews and records once (ADR 015, rule 2). Numbers: Operation specs, bookcase.

import { describe, expect, it } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { setShelves, setSize, startProject } from "./commands";
import { saveKerfBytes } from "./files";
import { STARTER_RECORD } from "./shop-record";
import { STARTER_SHOP, STARTER_STOCK } from "./starter";
import { createStorage } from "./storage";
import { createKerfStore, shownProject } from "./store";

const fresh = () =>
  createKerfStore({ storage: createStorage(memoryStorage()), library: memoryLibrary() });
const shelfCut = (s: ReturnType<typeof fresh>) =>
  s.getState().solved?.result.cutList.lines.find((l) => l.parts.some((p) => p.name === "Shelf"))
    ?.length;

describe("createKerfStore()", () => {
  it("remembers which sections are open across a reload", () => {
    const storage = createStorage(memoryStorage());
    createKerfStore({ storage, library: memoryLibrary() }).getState().toggleSection("Your shop");
    expect(
      createKerfStore({ storage, library: memoryLibrary() }).getState().sections["Your shop"],
    ).toBe(false);
  });

  it("shows a section for now without remembering it, and a toggle then closes and remembers it", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.sections", JSON.stringify({ Size: false }));
    const store = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
    store.getState().showSection("Size");
    expect(store.getState().sectionsShown).toEqual(["Size"]);
    expect(backing.getItem("kerf.sections")).toBe('{"Size":false}');
    // Shown, so the user's press closes it, and that choice is kept.
    store.getState().toggleSection("Size");
    expect(store.getState().sectionsShown).toEqual([]);
    expect(store.getState().sections.Size).toBe(false);
    expect(backing.getItem("kerf.sections")).toBe('{"Size":false}');
  });

  it("starts with no project open", () => {
    const s = fresh().getState();
    expect([s.history, s.projectId]).toEqual([null, null]);
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
      kind: "undo",
    });
  });

  describe("notices", () => {
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

    it("clears an Undo notice when that change is undone", () => {
      const { s, edit, p } = withNotice();
      s.getState().apply(edit, custom);
      s.getState().undo();
      expect(s.getState().notice).toBeNull();
      expect(shownProject(s.getState())).toEqual(p);
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
      expect(s.getState().notice).toEqual({ text: "plain", kind: "said" });
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
    const s = createKerfStore({ storage, library: memoryLibrary() });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const cuts = () => s.getState().solved?.result.joints.flatMap((j) => j.cuts) ?? [];
    expect(cuts().some((c) => !c.missing)).toBe(true);
    s.getState().setShopRecord({
      ...STARTER_RECORD,
      setUp: true,
      tableSaw: { kerf: 0 },
      dadoStack: null,
      router: null,
      chisels: false,
      dovetailSaw: false,
    });
    expect(cuts().length).toBeGreaterThan(0);
    expect(cuts().every((c) => c.missing)).toBe(true);
    // Saved as a pegboard: a saw with no cut width, no other tool, and the starter stock kept.
    expect(JSON.parse(storage.read("kerf.shop") ?? "null")).toMatchObject({
      version: 2,
      setUp: true,
      tableSaw: { kerf: 0 },
      dadoStack: null,
      router: null,
      chisels: false,
      stock: STARTER_STOCK,
    });
  });

  it("falls back to the starter shop with a plain notice when the saved shop is invalid", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.shop", JSON.stringify({ kerf: 0 }));
    const s = createKerfStore({
      storage: createStorage(backing),
      library: memoryLibrary(),
    }).getState();
    expect(s.shop).toEqual(STARTER_SHOP);
    expect(s.notice?.kind).toBe("warning");
    expect(s.notice?.text.startsWith("Your saved shop could not be used")).toBe(true);
  });

  it("saves the theme", () => {
    const storage = createStorage(memoryStorage());
    const s = createKerfStore({ storage, library: memoryLibrary() });
    s.getState().setTheme("light");
    expect(s.getState().theme).toBe("light");
    expect(storage.read("kerf.theme")).toBe("light");
  });

  it("times the solve with the clock it is given: 25 − 10 = 15 ms", () => {
    const ticks = [10, 25];
    const s = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
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

  it("records nothing for a change that changes nothing", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    s.getState().apply({ label: "Nothing", project: structuredClone(p) });
    expect(s.getState().history?.entries).toHaveLength(1);
  });

  it("keeps an Undo notice when a change that changes nothing is ignored", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().say("Resized", true);
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    s.getState().apply({ label: "Nothing", project: structuredClone(p) });
    expect(s.getState().notice).toEqual({ text: "Resized", kind: "undo" });
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

describe("selected boards", () => {
  const started = () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    return s;
  };
  const shelves = (s: ReturnType<typeof fresh>) =>
    (s.getState().solved?.result.placements ?? []).filter((p) => p.source?.role === "shelf");

  it("are unselected when the step changes, but a selected structure stays", () => {
    const s = started();
    s.getState().select({ kind: "boards", instances: shelves(s).map((p) => p.instance) });
    s.getState().setStep("Shape");
    expect(s.getState().selection).toEqual({ kind: "none" });
    s.getState().select({ kind: "structure", structure: "form" });
    s.getState().setStep("Divide");
    expect(s.getState().selection).toEqual({ kind: "structure", structure: "form" });
  });

  it("drop the boards that undo removes and keep the others", () => {
    const s = started();
    const p = shownProject(s.getState());
    const structure = p?.structures[0];
    const opening = structure?.openings[0];
    if (!p || !structure || !opening) throw new Error("no opening");
    const r = setShelves(p, structure.id, opening.id, "5", "even");
    if (!r.ok) throw new Error(r.message);
    s.getState().apply(r.edit);
    const picked = shelves(s).map((x) => x.instance);
    expect(picked).toHaveLength(5);
    s.getState().select({ kind: "boards", instances: picked });
    s.getState().undo();
    const sel = s.getState().selection;
    expect(sel.kind === "boards" && sel.instances).toHaveLength(4);
  });

  it("become no selection when every one is gone", () => {
    const s = started();
    s.getState().select({ kind: "boards", instances: ["not-a-board"] });
    s.getState().jumpTo(0);
    expect(s.getState().selection).toEqual({ kind: "none" });
  });
});

describe("selected boards while dragging", () => {
  it("are kept by a preview that lacks them, and by cancelling it", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    const structure = p?.structures[0];
    const opening = structure?.openings[0];
    if (!p || !structure || !opening) throw new Error("no opening");
    const more = setShelves(p, structure.id, opening.id, "5", "even");
    if (!more.ok) throw new Error(more.message);
    s.getState().apply(more.edit);
    const shelf = s
      .getState()
      .solved?.result.placements.filter((x) => x.source?.role === "shelf")
      .at(-1);
    if (!shelf) throw new Error("no shelf");
    s.getState().select({ kind: "boards", instances: [shelf.instance] });
    s.getState().preview(p);
    expect(s.getState().solved?.result.placements.some((x) => x.instance === shelf.instance)).toBe(
      false,
    );
    expect(s.getState().selection).toEqual({ kind: "boards", instances: [shelf.instance] });
    s.getState().cancelPreview();
    expect(s.getState().selection).toEqual({ kind: "boards", instances: [shelf.instance] });
  });
});

describe("pending tool state", () => {
  it("starts empty, holds a half-finished action, and is cleared by picking a tool", () => {
    const s = fresh();
    expect(s.getState().pending).toBeNull();
    s.getState().setTool("tape");
    s.getState().setPending({ tool: "tape", from: [0, 0, 0] });
    expect(s.getState().pending).toEqual({ tool: "tape", from: [0, 0, 0] });
    s.getState().setTool("move");
    expect(s.getState().pending).toBeNull();
  });

  it("drops an action that a tool the user has left tries to set, and still clears on request", () => {
    const s = fresh();
    s.getState().setTool("move");
    s.getState().setPending({ tool: "tape", from: [0, 0, 0] });
    expect(s.getState().pending).toBeNull();
    s.getState().setPending({ tool: "move", axis: 2 });
    s.getState().setPending({ tool: "join", first: "a" });
    expect(s.getState().pending).toEqual({ tool: "move", axis: 2 });
    s.getState().setPending(null);
    expect(s.getState().pending).toBeNull();
  });

  describe("the Join tool's half-finished work", () => {
    const withProposal = () => {
      const s = fresh();
      s.getState().apply(startProject("Bookcase", "imperial"));
      const a = s.getState().solved?.result.placements[0]?.instance ?? "";
      const sizeEdit = () => {
        const p = shownProject(s.getState());
        if (!p) throw new Error("no project");
        const r = setSize(p, p.structures[0]?.id ?? "", "w", '30"');
        if (!r.ok) throw new Error(r.message);
        return r.edit;
      };
      const start = () => {
        s.getState().setTool("join");
        s.getState().setPending({ tool: "join", first: a });
        s.getState().setProposal({ a, b: a, result: { ok: false, reason: "No." } });
      };
      start();
      return { s, start, sizeEdit };
    };

    it("are gone after an undo", () => {
      const { s, sizeEdit } = withProposal();
      s.getState().apply(sizeEdit());
      s.getState().setPending({ tool: "join", first: "x" });
      s.getState().setProposal({ a: "x", b: "y", result: { ok: false, reason: "No." } });
      s.getState().undo();
      expect(s.getState().proposal).toBeNull();
      expect(s.getState().pending).toBeNull();
    });

    it("are gone after a resize", () => {
      const { s, sizeEdit } = withProposal();
      s.getState().apply(sizeEdit());
      expect(s.getState().proposal).toBeNull();
      expect(s.getState().pending).toBeNull();
    });

    it("are gone after a redo and after jumping in History", () => {
      const { s, start, sizeEdit } = withProposal();
      s.getState().apply(sizeEdit());
      s.getState().undo();
      start();
      s.getState().redo();
      expect(s.getState().proposal).toBeNull();
      start();
      s.getState().jumpTo(0);
      expect(s.getState().proposal).toBeNull();
      expect(s.getState().pending).toBeNull();
    });

    it("are gone when a drag is committed, but a preview leaves them", () => {
      const { s } = withProposal();
      const p = shownProject(s.getState());
      if (!p) throw new Error("no project");
      s.getState().preview(p);
      expect(s.getState().proposal).not.toBeNull();
      s.getState().commit("Moved");
      expect(s.getState().proposal).toBeNull();
    });

    it("do not clear another tool's pending", () => {
      const { s, sizeEdit } = withProposal();
      s.getState().setTool("tape");
      s.getState().setPending({ tool: "tape", from: [0, 0, 0] });
      s.getState().apply(sizeEdit());
      expect(s.getState().pending).toEqual({ tool: "tape", from: [0, 0, 0] });
    });

    it("are gone when the tool changes", () => {
      const { s } = withProposal();
      s.getState().setTool("move");
      expect(s.getState().proposal).toBeNull();
    });
  });
});

describe("a tool action under way", () => {
  /** The bookcase recorded, then Width 30" recorded, so there is an entry to undo. */
  const resized = () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    const r = setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!r.ok) throw new Error(r.message);
    s.getState().apply(r.edit);
    return { s, wide: p };
  };

  it("is dropped with its preview when the tool changes, so the recorded project shows again", () => {
    const { s, wide } = resized();
    s.getState().setTool("move");
    s.getState().preview(wide);
    s.getState().setTool("select");
    expect(s.getState().previewed).toBeNull();
    // The recorded entry is Width 30": shelves 29-1/16" cut (5905500), not the previewed 35-1/16".
    expect(shelfCut(s)).toBe(5_905_500);
  });

  it.each([
    ["undo", (s: ReturnType<typeof fresh>) => s.getState().undo()],
    [
      "redo",
      (s: ReturnType<typeof fresh>) => {
        s.getState().undo();
        s.getState().setPending({ tool: "board", from: { placed: null, point: [0, 0, 0] } });
        s.getState().redo();
      },
    ],
    ["jumpTo", (s: ReturnType<typeof fresh>) => s.getState().jumpTo(0)],
    [
      "opening another project",
      (s: ReturnType<typeof fresh>) =>
        s.getState().createProject(startProject("Bookcase", "imperial"), ""),
    ],
  ])("is dropped for every tool when History moves by %s", async (_, move) => {
    const { s } = resized();
    s.getState().setTool("board");
    s.getState().setPending({ tool: "board", from: { placed: null, point: [0, 0, 0] } });
    await move(s);
    expect(s.getState().pending).toBeNull();
  });
});

describe("Undo and Redo with nothing to step to", () => {
  /** One entry only, with Join's first click, its proposal and an Undo offer on screen. */
  const startedJoin = () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setTool("join");
    s.getState().setPending({ tool: "join", first: "a" });
    s.getState().setProposal({ a: "a", b: "b", result: { ok: false, reason: "No." } });
    s.getState().say("Shelf 2 now overlaps Back; Undo puts it back.", true);
    return s;
  };

  it.each([
    ["Undo at the first entry", (s: ReturnType<typeof fresh>) => s.getState().undo()],
    ["Redo at the last entry", (s: ReturnType<typeof fresh>) => s.getState().redo()],
  ])("%s leaves the tool's action, the proposal and the notice as they were", (_, step) => {
    const s = startedJoin();
    const before = s.getState();
    step(s);
    const after = s.getState();
    expect(after.history).toBe(before.history);
    expect(after.pending).toEqual({ tool: "join", first: "a" });
    expect(after.proposal).toBe(before.proposal);
    expect(after.notice).toEqual({
      text: "Shelf 2 now overlaps Back; Undo puts it back.",
      kind: "undo",
    });
  });
});

describe("boards the 3D view could not draw", () => {
  it("are remembered, each once, until History moves, when the view tries them again", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().boardNotDrawn("a");
    s.getState().boardNotDrawn("b");
    s.getState().boardNotDrawn("a");
    expect(s.getState().notDrawn).toEqual(["a", "b"]);
    s.getState().apply(startProject("Blank case", "imperial"));
    expect(s.getState().notDrawn).toEqual([]);
  });
});

describe("abandonAction()", () => {
  it("drops the tool's action without solving again when nothing is previewed", () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setTool("tape");
    s.getState().setPending({ tool: "tape", from: [0, 0, 0] });
    const solved = s.getState().solved;
    s.getState().abandonAction();
    expect(s.getState().pending).toBeNull();
    expect(s.getState().solved).toBe(solved);
  });
});

describe("the tape and guide lines", () => {
  const measured = () => {
    const s = fresh();
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setTape({ from: [0, 0, 0], to: [203_200, 0, 0] });
    s.getState().addGuide([0, 0, 0], [203_200, 0, 0]);
    return s;
  };

  it("keeps guides as they are added, and clears them all", () => {
    const s = measured();
    s.getState().addGuide([0, 0, 0], [0, 203_200, 0]);
    expect(s.getState().guides).toHaveLength(2);
    s.getState().clearGuides();
    expect(s.getState().guides).toEqual([]);
  });

  it("are gone when another project is started or opened", async () => {
    const s = measured();
    s.getState().setPending({ tool: "tape", from: [0, 0, 0] });
    await s.getState().createProject(startProject("Blank case", "imperial"), "");
    expect(s.getState().guides).toEqual([]);
    expect(s.getState().tape).toBeNull();
    expect(s.getState().pending).toBeNull();
  });

  it("are not written to the file (ADR 015, D6)", () => {
    const times = { created: "2026-10-12T10:00:00.000Z", modified: "2026-10-12T11:00:00.000Z" };
    const withGuides = measured();
    const without = fresh();
    without.getState().apply(startProject("Bookcase", "imperial"));
    const save = (s: typeof fresh extends () => infer S ? S : never) => {
      const project = shownProject(s.getState());
      if (!project) throw new Error("no project");
      return saveKerfBytes(project, times);
    };
    expect(save(withGuides)).toEqual(save(without));
  });

  it("are not written to browser storage", () => {
    const storage = createStorage(memoryStorage());
    const s = createKerfStore({ storage, library: memoryLibrary() });
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().addGuide([0, 0, 0], [203_200, 0, 0]);
    expect(createKerfStore({ storage, library: memoryLibrary() }).getState().guides).toEqual([]);
  });
});
