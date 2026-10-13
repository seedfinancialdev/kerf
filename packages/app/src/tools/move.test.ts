// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Move / copy: M (Ctrl copy, Shift mirror-copy): Move with axis locks and typed
// distances". Domain model: "Mirroring never changes a part's cut list line". Editing a form's
// board detaches only that board (Interaction spec, "Tweak").

import { type PlacedPart, type Project, solve, type Vec3 } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { lockedDelta, type MoveMode, moveBoards, moveTool } from "./move";
import type { ModelHit, ModelPointer } from "./pointer";

const shop = loadShopProfile();
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
    expect(r.ok).toBe(false);
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
    const s = createKerfStore({ storage: createStorage(memoryStorage()) });
    s.getState().apply(startProject("Bookcase", "imperial"));
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
  ): ModelPointer => ({ kind, hit: h, shift: keys.shift ?? false, ctrl: keys.ctrl ?? false });
  const topOf = (s: Store) => {
    const found = s.getState().solved?.result.placements.find((p) => p.partName === "Top");
    if (!found) throw new Error("no top");
    return found;
  };
  const entries = (s: Store) => s.getState().history?.entries.length;
  const pick = (s: Store, ...placed: PlacedPart[]) =>
    s.getState().select({ kind: "boards", instances: placed.map((p) => p.instance) });
  const lock = (s: Store, axis: 0 | 1 | 2) =>
    s.getState().setPending({ tool: "move", from: [0, 0, 0], placed: [], axis, last: null });
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
    expect(s.getState().notice?.text).toBe("Top is now custom; the form won't change it.");
    expect(s.getState().pending).toBeNull();
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

    it("moves down for a negative distance", () => {
      const s = started();
      const top = topOf(s);
      pick(s, top);
      lock(s, 2);
      expect(moveTool.measure?.('-2"', s)).toBeNull();
      expect(topOf(s).box.min[2]).toBe(top.box.min[2] - 2 * IN);
    });

    it("asks for boards first when nothing is picked", () => {
      expect(moveTool.measure?.('2"', started())).toBe("Select the boards to move first.");
    });

    it("refuses text that is not a length, keeping the lock", () => {
      const s = started();
      pick(s, topOf(s));
      lock(s, 2);
      expect(moveTool.measure?.("abc", s)).not.toBeNull();
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
    expect(moveTool.prompt?.(s.getState())).toBe('Distance, e.g. 2"');
  });
});
