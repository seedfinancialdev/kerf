// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Move / copy: M (Ctrl copy, Shift mirror-copy): Move with axis locks and typed
// distances". Domain model: "Mirroring never changes a part's cut list line". Editing a form's
// board detaches only that board (Interaction spec, "Tweak").

import { type PlacedPart, type Project, solve, type Vec3 } from "@kerf/core";
import { loadProject, loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import type { Pending } from "../model/pending";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { lockedDelta, type MoveMode, moveBoards, moveTool } from "./move";
import type { ModelHit, ModelPointer } from "./pointer";

const shop = loadShopProfile();
/**
 * The canonical bookcase saves its shelf row by hand (a pattern no form makes), so the engine can
 * take no one shelf out of it (ADR 015, known limit 25).
 */
const HAND_ROW =
  "Shelf 1 is one of a row made by hand, and Kerf can't change one board of that row on its own yet.";
const IN = 203_200;
const project = () => startProject("Bookcase", "imperial").project;
const named = (p: Project, name: string) =>
  solve(p, shop).placements.filter((x) => x.name === name || x.partName === name);
const first = (p: Project, name: string): PlacedPart => {
  const found = named(p, name)[0];
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const moved = (placed: PlacedPart[], delta: Vec3, mode: MoveMode = "move", p = project()) => {
  const r = moveBoards(p, placed, delta, mode, shop);
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe("moveBoards()", () => {
  it('moves the top up 1": its box rises by exactly 1"', () => {
    const p = project();
    const top = first(p, "Top");
    const r = moved([top], [0, 0, IN]);
    expect(r.edit.label).toBe('Moved Top 1"');
    expect(first(r.edit.project, "Top").box.min[2]).toBe(top.box.min[2] + IN);
    expect(first(r.edit.project, "Top").box.min[0]).toBe(top.box.min[0]);
  });

  it("takes the top over from the form, and only the top", () => {
    const r = moved([first(project(), "Top")], [0, 0, IN]);
    const detached = r.edit.project.parts.filter((d) => d.detached).map((d) => d.name);
    expect(detached).toEqual(["Top"]);
  });

  it('copies the right side 12" to the left, leaving the side where it was', () => {
    const p = project();
    const right = first(p, "Right side");
    const r = moved([right], [-12 * IN, 0, 0], "copy");
    expect(r.edit.label).toBe("Copied Right side");
    const after = solve(r.edit.project, shop).placements;
    expect(after).toHaveLength(solve(p, shop).placements.length + 1);
    expect(after.find((x) => x.instance === right.instance)?.box).toEqual(right.box);
    expect(after.some((x) => x.box.min[0] === right.box.min[0] - 12 * IN)).toBe(true);
  });

  it("selects the new copy, not the board it came from", () => {
    const p = project();
    const right = first(p, "Right side");
    const r = moved([right], [-12 * IN, 0, 0], "copy");
    expect(r.picked).toHaveLength(1);
    expect(r.picked).not.toContain(right.instance);
    expect(r.edit.project.instances.map((i) => i.id)).toContain(r.picked[0]);
  });

  it("names a second copy of a board so the two copies can be told apart", () => {
    const once = moved([first(project(), "Right side")], [-12 * IN, 0, 0], "copy");
    const twice = moved(
      [first(once.edit.project, "Right side")],
      [-24 * IN, 0, 0],
      "copy",
      once.edit.project,
    );
    const names = twice.edit.project.instances.map((i) => i.name);
    expect(names).toContain("Right side copy");
    expect(names).toContain("Right side copy 2");
  });

  it("mirror-copies a side: the copy's length runs the other way", () => {
    const p = project();
    const source = first(p, "Right side");
    const r = moved([source], [48 * IN, 0, 0], "mirror");
    expect(r.edit.label).toBe("Mirror-copied Right side");
    const copy = solve(r.edit.project, shop).placements.find(
      (x) => x.box.min[0] === source.box.min[0] + 48 * IN,
    );
    expect(copy?.frame.x).toEqual(source.frame.x.map((n) => -n || 0));
  });

  it("does not change a part's cut list line when it is mirror-copied", () => {
    const p = project();
    const r = moved([first(p, "Right side")], [48 * IN, 0, 0], "mirror");
    const sides = solve(r.edit.project, shop).placements.filter((x) => x.partName === "Side");
    expect(sides).toHaveLength(3);
    expect(new Set(sides.map((s) => s.part)).size).toBe(1);
  });

  it("moves two boards together, taking the shared part over once", () => {
    const p = project();
    const sides = [first(p, "Right side"), first(p, "Left side")];
    const r = moved(sides, [0, IN, 0]);
    expect(r.edit.label).toBe('Moved 2 boards 1"');
    for (const side of sides) {
      const now = solve(r.edit.project, shop).placements.find((x) => x.name === side.name);
      expect(now?.box.min[1]).toBe(side.box.min[1] + IN);
    }
  });

  it("moves one shelf of a row without moving the others", () => {
    const p = project();
    const shelves = named(p, "Shelf");
    const [one, other] = shelves;
    if (!one || !other) throw new Error("the bookcase has two shelves or more");
    const r = moved([one], [0, 0, IN]);
    const after = solve(r.edit.project, shop).placements;
    expect(after.filter((x) => x.partName.startsWith("Shelf"))).toHaveLength(shelves.length);
    const zs = after.filter((x) => x.partName.startsWith("Shelf")).map((x) => x.box.min[2]);
    expect(zs).toContain(one.box.min[2] + IN);
    expect(zs).toContain(other.box.min[2]);
    expect(zs).not.toContain(one.box.min[2]);
  });

  it("moves the board's new self after it left its row, so the pick can follow", () => {
    const p = project();
    const shelf = first(p, "Shelf");
    const r = moved([shelf], [0, 0, IN]);
    const picked = solve(r.edit.project, shop).placements.filter((x) =>
      r.picked.includes(x.instance),
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]?.box.min[2]).toBe(shelf.box.min[2] + IN);
  });

  it("changes nothing for a distance of zero: no take-over, nothing to record", () => {
    const r = moveBoards(project(), [first(project(), "Top")], [0, 0, 0], "move", shop);
    expect(r).toEqual({ ok: false, message: "A distance of zero changes nothing." });
  });

  it("refuses a copy that would sit exactly on its board", () => {
    const r = moveBoards(project(), [first(project(), "Top")], [0, 0, 0], "copy", shop);
    expect(r).toEqual({ ok: false, message: "A distance of zero changes nothing." });
  });

  it("moves a metric top down 50 mm: its box drops by exactly 400000 units, written in mm", () => {
    // 1 mm = 8000 units, so 50 mm = 400000. The position is written as an exact millimetre sum.
    const p = startProject("Bookcase", "metric").project;
    const top = first(p, "Top");
    const r = moved([top], [0, 0, -400_000], "move", p);
    expect(first(r.edit.project, "Top").box.min[2]).toBe(top.box.min[2] - 400_000);
    const z = r.edit.project.instances.find((i) => i.name === "Top")?.position.z;
    expect(z).toMatch(/\) - 50mm$/);
  });

  it("refuses to move one shelf of a row saved by hand, saying why instead of asking for another click", () => {
    const p = loadProject("bookcase");
    const r = moveBoards(p, [first(p, "Shelf 1")], [0, 0, IN], "move", shop);
    expect(r).toEqual({ ok: false, message: HAND_ROW });
  });

  it("refuses with nothing picked", () => {
    const r = moveBoards(project(), [], [IN, 0, 0], "move", shop);
    expect(r).toEqual({ ok: false, message: "Select the boards to move first." });
  });
});

describe("lockedDelta()", () => {
  it("keeps only the largest direction of a drag", () => {
    expect(lockedDelta([0, 0, 0], [3, 10, -2], null)).toEqual([0, 10, 0]);
  });

  it("keeps only the locked axis", () => {
    expect(lockedDelta([0, 0, 0], [3, 10, -2], 2)).toEqual([0, 0, -2]);
  });

  it("measures from the start of the drag, and keeps a negative direction", () => {
    expect(lockedDelta([5, 5, 5], [5, -4, 6], null)).toEqual([0, -9, 0]);
  });

  it("gives no movement for a drag that went nowhere", () => {
    expect(lockedDelta([1, 2, 3], [1, 2, 3], null)).toEqual([0, 0, 0]);
  });
});

describe("the Move tool", () => {
  const started = () => {
    const s = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setTool("move");
    return s;
  };
  type Store = ReturnType<typeof started>;
  const hit = (placed: PlacedPart, point: Vec3): ModelHit => ({
    placed,
    point,
    normal: placed.frame.z,
  });
  const event = (
    kind: ModelPointer["kind"],
    h: ModelHit | null,
    keys: { ctrl?: boolean; shift?: boolean } = {},
  ): ModelPointer => ({
    kind,
    hit: h,
    ray: null,
    shift: keys.shift ?? false,
    ctrl: keys.ctrl ?? false,
  });
  const topOf = (s: Store) => {
    const found = s.getState().solved?.result.placements.find((p) => p.partName === "Top");
    if (!found) throw new Error("no top");
    return found;
  };
  const entries = (s: Store) => s.getState().history?.entries.length;
  const pick = (s: Store, ...placed: PlacedPart[]) =>
    s.getState().select({ kind: "boards", instances: placed.map((p) => p.instance) });
  const lock = (s: Store, axis: 0 | 1 | 2, was: Pending | null = null) =>
    s.getState().setPending({
      tool: "move",
      ...(was?.tool === "move" ? was : {}),
      axis,
    });
  const drag = (s: Store, placed: PlacedPart, to: Vec3, keys = {}) => {
    moveTool.pointer?.(event("down", hit(placed, [0, 0, 0])), s);
    moveTool.pointer?.(event("move", hit(placed, to), keys), s);
    return () => moveTool.pointer?.(event("up", hit(placed, to), keys), s);
  };

  it("previews a drag and records it once on release, with a notice for the take-over", () => {
    const s = started();
    const top = topOf(s);
    pick(s, top);
    const before = entries(s);
    const release = drag(s, top, [0, 0, IN]);
    expect(s.getState().previewed).not.toBeNull();
    release();
    expect(entries(s)).toBe((before ?? 0) + 1);
    expect(topOf(s).box.min[2]).toBe(top.box.min[2] + IN);
    expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Top 1"');
    // Raised 1" the Top leaves its rabbet in the Right side: the move is recorded and what it
    // caused is named, in shop words (ADR 015, rule 13).
    expect(s.getState().notice?.text).toBe(
      "Top is now custom; the form won't change it. Top now misses its rabbet in Right side; " +
        "Undo puts it back.",
    );
    expect(s.getState().pending).toBeNull();
  });

  it("names every board the move took over: both sides share one board, so both become custom", () => {
    const s = started();
    const left = s.getState().solved?.result.placements.find((p) => p.name === "Left side");
    if (!left) throw new Error("no left side");
    pick(s, left);
    const release = drag(s, left, [0, 0, IN]);
    release();
    expect(s.getState().notice?.text).toMatch(
      /^Right side and Left side are now custom; the form won't change them\. /,
    );
  });

  it("records a move that brings a problem, and names it with Undo", () => {
    const s = started();
    const shelf2 = s.getState().solved?.result.placements.find((p) => p.name === "Shelf 2");
    if (!shelf2) throw new Error("no Shelf 2");
    pick(s, shelf2);
    // Moved 1" to the right it leaves its dado in the Right side and runs into the Left side; the
    // first thing it caused is named, in shop words (ADR 015, rule 13).
    expect(moveTool.measure?.('1"', s)).toBeNull();
    expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Shelf 2 1"');
    expect(s.getState().notice).toEqual({
      text:
        "Shelf 2 becomes Shelf copy 2, custom; the form won't change it. Shelf copy 2 now " +
        "misses its dado in Right side; Undo puts it back.",
      kind: "undo",
    });
  });

  it("drags the picked boards together when the board under the pointer is one of them", () => {
    const s = started();
    const placed = s.getState().solved?.result.placements ?? [];
    const sides = placed.filter((p) => p.partName === "Side");
    pick(s, ...sides);
    drag(s, sides[0] as PlacedPart, [0, IN, 0])();
    expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved 2 boards 1"');
  });

  it("drags only the board under the pointer when it is not among the picked", () => {
    const s = started();
    const placed = s.getState().solved?.result.placements ?? [];
    const side = placed.find((p) => p.partName === "Side") as PlacedPart;
    pick(s, side);
    drag(s, topOf(s), [0, 0, IN])();
    expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Top 1"');
  });

  it("moves only along the largest direction of the drag", () => {
    const s = started();
    const top = topOf(s);
    drag(s, top, [IN, 3 * IN, 2 * IN])();
    const after = topOf(s);
    expect(after.box.min[1]).toBe(top.box.min[1] + 3 * IN);
    expect(after.box.min[0]).toBe(top.box.min[0]);
    expect(after.box.min[2]).toBe(top.box.min[2]);
  });

  it("moves along the locked direction, not the largest", () => {
    const s = started();
    const top = topOf(s);
    lock(s, 2);
    drag(s, top, [IN, 3 * IN, 2 * IN])();
    expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
    expect(topOf(s).box.min[1]).toBe(top.box.min[1]);
  });

  it("copies with Ctrl, picks the copy and leaves the board", () => {
    const s = started();
    const top = topOf(s);
    const before = s.getState().solved?.result.placements.length ?? 0;
    drag(s, top, [0, 0, IN], { ctrl: true })();
    expect(s.getState().solved?.result.placements).toHaveLength(before + 1);
    expect(s.getState().history?.entries.at(-1)?.label).toBe("Copied Top");
    const sel = s.getState().selection;
    expect(sel.kind === "boards" && sel.instances).toHaveLength(1);
    expect(sel.kind === "boards" && sel.instances.includes(top.instance)).toBe(false);
  });

  it("mirror-copies with Shift", () => {
    const s = started();
    drag(s, topOf(s), [0, 0, IN], { shift: true })();
    expect(s.getState().history?.entries.at(-1)?.label).toBe("Mirror-copied Top");
  });

  it("keeps a moved shelf picked after it left its row", () => {
    const s = started();
    const shelf = s.getState().solved?.result.placements.find((p) => p.partName === "Shelf");
    if (!shelf) throw new Error("no shelf");
    pick(s, shelf);
    drag(s, shelf, [0, 0, IN])();
    const sel = s.getState().selection;
    const ids = sel.kind === "boards" ? sel.instances : [];
    const now = s.getState().solved?.result.placements.filter((p) => ids.includes(p.instance));
    expect(now).toHaveLength(1);
    expect(now?.[0]?.box.min[2]).toBe(shelf.box.min[2] + IN);
  });

  describe("by the pointer's line of sight", () => {
    // Scene is y up, so a sight line straight down the scene's z at scene height h meets the
    // up line through the origin at h inches: project (x, y, z) is scene (x, z, -y).
    const sight = (height: number) => ({ origin: [0, height, 50], dir: [0, 0, -1] }) as const;
    const seen = (kind: ModelPointer["kind"], height: number, h: ModelHit | null = null) =>
      ({ kind, hit: h, ray: sight(height), shift: false, ctrl: false }) satisfies ModelPointer;

    it("lifts the top exactly 2 inches when the sight line rises 2 inches on the up lock", () => {
      const s = started();
      const top = topOf(s);
      lock(s, 2);
      moveTool.pointer?.({ ...seen("down", 0, hit(top, [0, 0, 0])) }, s);
      moveTool.pointer?.(seen("move", 2), s);
      moveTool.pointer?.(seen("up", 2), s);
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
      expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Top 2"');
    });

    it("does not add up: the same sight line twice gives the same preview and the same lift", () => {
      const s = started();
      const top = topOf(s);
      lock(s, 2);
      moveTool.pointer?.(seen("down", 0, hit(top, [0, 0, 0])), s);
      moveTool.pointer?.(seen("move", 2), s);
      const once = s.getState().previewed;
      moveTool.pointer?.(seen("move", 2), s);
      expect(s.getState().previewed).toBe(once);
      moveTool.pointer?.(seen("up", 2), s);
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
    });

    it("records nothing for a release with no move before it", () => {
      const s = started();
      const before = entries(s);
      lock(s, 2);
      moveTool.pointer?.(seen("down", 0, hit(topOf(s), [0, 0, 0])), s);
      moveTool.pointer?.(seen("up", 2), s);
      expect(entries(s)).toBe(before);
      expect(s.getState().history?.entries[0]?.project.parts.some((d) => d.detached)).toBeFalsy();
    });

    it("records a release that is off every board, because the sight line is all it needs", () => {
      const s = started();
      const top = topOf(s);
      const before = entries(s);
      moveTool.pointer?.(seen("down", 0, hit(top, [0, 0, 0])), s);
      moveTool.pointer?.(seen("move", 3), s);
      moveTool.pointer?.(seen("up", 3), s);
      expect(entries(s)).toBe((before ?? 0) + 1);
      expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Top 3"');
    });

    it("measures on the plane facing the viewer when no direction is locked", () => {
      const s = started();
      const top = topOf(s);
      moveTool.pointer?.(seen("down", 0, hit(top, [0, 0, 0])), s);
      moveTool.pointer?.(seen("move", 2), s);
      moveTool.pointer?.(seen("up", 2), s);
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
    });

    it("lets a lock set mid-drag take over from where the drag began", () => {
      const s = started();
      const top = topOf(s);
      moveTool.pointer?.(seen("down", 0, hit(top, [0, 0, 0])), s);
      lock(s, 2, s.getState().pending);
      moveTool.pointer?.(seen("move", 1), s);
      moveTool.pointer?.(seen("up", 1), s);
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + IN);
    });
  });

  it("records nothing and shows no preview when a drag returns to where it started", () => {
    const s = started();
    const top = topOf(s);
    const before = entries(s);
    drag(s, top, [0, 0, IN]);
    moveTool.pointer?.(event("move", hit(top, [0, 0, 0])), s);
    expect(s.getState().previewed).toBeNull();
    moveTool.pointer?.(event("up", hit(top, [0, 0, 0])), s);
    expect(entries(s)).toBe(before);
    expect(s.getState().notice).toBeNull();
    expect(s.getState().pending).toBeNull();
    expect(s.getState().history?.entries[0]?.project.parts.some((d) => d.detached)).toBeFalsy();
  });

  it("drops the preview when released off the model", () => {
    const s = started();
    const top = topOf(s);
    const before = entries(s);
    drag(s, top, [0, 0, IN]);
    moveTool.pointer?.(event("up", null), s);
    expect(s.getState().previewed).toBeNull();
    expect(entries(s)).toBe(before);
    expect(s.getState().pending).toBeNull();
  });

  describe("a typed distance", () => {
    it("moves the picked boards up when the up direction is locked", () => {
      const s = started();
      const top = topOf(s);
      pick(s, top);
      lock(s, 2);
      expect(moveTool.measure?.('2"', s)).toBeNull();
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
      expect(s.getState().history?.entries.at(-1)?.label).toBe('Moved Top 2"');
      expect(s.getState().pending).toBeNull();
    });

    it("keeps an arrow lock pressed before the click, so the typed distance follows it", () => {
      const s = started();
      const top = topOf(s);
      lock(s, 2);
      // A click on the top that never moves: press and release at the same point.
      moveTool.pointer?.(event("down", hit(top, [0, 0, 0])), s);
      moveTool.pointer?.(event("up", hit(top, [0, 0, 0])), s);
      expect(s.getState().pending).toMatchObject({ tool: "move", axis: 2 });
      expect(moveTool.measure?.('2"', s)).toBeNull();
      // Up 2" (z), not 2" left to right (x).
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] + 2 * IN);
      expect(topOf(s).box.min[0]).toBe(top.box.min[0]);
    });

    it("moves down for a negative distance", () => {
      const s = started();
      const top = topOf(s);
      pick(s, top);
      lock(s, 2);
      expect(moveTool.measure?.('-2"', s)).toBeNull();
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] - 2 * IN);
    });

    it("moves a metric top down by a typed -50mm: exactly 400000 units", () => {
      // 50 mm x 8000 units per mm = 400000 (Domain model, "Units & precision").
      const s = createKerfStore({
        storage: createStorage(memoryStorage()),
        library: memoryLibrary(),
      });
      s.getState().apply(startProject("Bookcase", "metric"));
      s.getState().setTool("move");
      const top = topOf(s);
      pick(s, top);
      lock(s, 2);
      expect(moveTool.measure?.("-50mm", s)).toBeNull();
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] - 400_000);
    });

    it("asks for boards first when nothing is picked", () => {
      expect(moveTool.measure?.('2"', started())).toBe("Select the boards to move first.");
    });

    it("refuses text that is not a length, keeping the lock", () => {
      const s = started();
      pick(s, topOf(s));
      lock(s, 2);
      expect(moveTool.measure?.("abc", s)).toBe('Unknown name "abc"');
      expect(s.getState().pending).toMatchObject({ tool: "move", axis: 2 });
    });

    it("refuses a typed zero and leaves the board with the form", () => {
      const s = started();
      pick(s, topOf(s));
      const before = entries(s);
      expect(moveTool.measure?.('0"', s)).toBe("A distance of zero changes nothing.");
      expect(entries(s)).toBe(before);
      expect(s.getState().notice).toBeNull();
    });
  });

  it("asks what to do next", () => {
    const s = started();
    expect(moveTool.prompt?.(s.getState())).toBe("Select boards first");
    pick(s, topOf(s));
    expect(moveTool.prompt?.(s.getState())).toBe(
      "Distance (left to right unless you press an arrow key)",
    );
    lock(s, 2);
    expect(moveTool.prompt?.(s.getState())).toBe('Distance up, e.g. 2"');
    lock(s, 0);
    expect(moveTool.prompt?.(s.getState())).toBe('Distance left to right, e.g. 2"');
    lock(s, 1);
    expect(moveTool.prompt?.(s.getState())).toBe('Distance back to front, e.g. 2"');
  });
});
