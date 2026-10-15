// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Push/Pull": "Change a part's length or width; thickness is locked to the
// stock." Editing a form's board detaches only that board (Interaction spec, "Tweak").

import { type PlacedPart, solve } from "@kerf/core";
import { loadProject, loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import type { ModelHit, ModelPointer } from "./pointer";
import { faceOf, pushPull, pushPullTool, travelAlong } from "./push-pull";

const shop = loadShopProfile();
/**
 * The canonical bookcase saves its shelf row by hand (a pattern no form makes), so the engine can
 * take no one shelf out of it (ADR 015, known limit 25).
 */
const HAND_ROW =
  "Shelf 1 is one of a row made by hand, and Kerf can't change one board of that row on its own yet.";
const IN = 203_200;
const project = () => startProject("Bookcase", "imperial").project;
const board = (name: string, p = project()): PlacedPart => {
  const found = solve(p, shop).placements.find((x) => x.partName === name || x.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const top = () => board("Top");
/** Domain model: a part's size must come out above zero (the solver's invalid-dimension rule). */
const TOP_TO_NOTHING =
  "Top length must be greater than zero (it is zero or negative after rounding to the grid).";

describe("pushPull()", () => {
  it('lengthens the top by 1" at its second end: 34-9/16 + 1 = 35-9/16', () => {
    const r = pushPull(project(), top(), "end1", IN, shop);
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe('Lengthened Top by 1"');
    expect(board("Top", r.edit.project).size.length).toBe(7_023_100 + IN);
  });

  it("keeps the top's first end where it was when the second end moves", () => {
    const r = pushPull(project(), top(), "end1", IN, shop);
    if (!r.ok) throw new Error(r.message);
    const before = top().box;
    const after = board("Top", r.edit.project).box;
    const axis = top().frame.x.findIndex((n) => n !== 0);
    const fixed = (top().frame.x[axis] ?? 0) > 0 ? "min" : "max";
    expect(after[fixed][axis]).toBe(before[fixed][axis]);
  });

  it("moves the first end outward and keeps the second end where it was", () => {
    const r = pushPull(project(), top(), "end0", IN, shop);
    if (!r.ok) throw new Error(r.message);
    const before = top().box;
    const after = board("Top", r.edit.project).box;
    const axis = top().frame.x.findIndex((n) => n !== 0);
    const fixed = (top().frame.x[axis] ?? 0) > 0 ? "max" : "min";
    expect(after[fixed][axis]).toBe(before[fixed][axis]);
    expect(board("Top", r.edit.project).size.length).toBe(7_023_100 + IN);
  });

  it("shortens a board by a negative distance", () => {
    const r = pushPull(project(), top(), "end1", -IN, shop);
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe('Shortened Top by 1"');
    expect(board("Top", r.edit.project).size.length).toBe(7_023_100 - IN);
  });

  it("widens a board from an edge, and says so", () => {
    const r = pushPull(project(), top(), "edge1", IN, shop);
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe('Widened Top by 1"');
    expect(board("Top", r.edit.project).size.width).toBe(top().size.width + IN);
  });

  it("takes the top over from the form", () => {
    const r = pushPull(project(), top(), "end1", IN, shop);
    expect(r.ok && r.edit.project.parts.find((d) => d.name === "Top")?.detached).toBe(true);
  });

  it("changes nothing for a distance of zero: no take-over, nothing to record", () => {
    const r = pushPull(project(), top(), "end1", 0, shop);
    expect(r).toEqual({ ok: false, message: "A distance of zero changes nothing." });
  });

  it("refuses to change one shelf of a row saved by hand, saying why instead of asking for another click", () => {
    const p = loadProject("bookcase");
    expect(pushPull(p, board("Shelf 1", p), "end1", IN, shop)).toEqual({
      ok: false,
      message: HAND_ROW,
    });
  });

  it("refuses to push a board to nothing", () => {
    const r = pushPull(project(), top(), "end1", -40 * IN, shop);
    expect(r).toEqual({ ok: false, message: TOP_TO_NOTHING });
  });

  it("refuses to shorten the top by exactly its length, which leaves nothing", () => {
    // The top is 34-9/16" long (36 - 2 x 23/32 = 7023100 units); less all of it is zero.
    const r = pushPull(project(), top(), "end1", -7_023_100, shop);
    expect(r).toEqual({ ok: false, message: TOP_TO_NOTHING });
  });

  it('shortens the top to one 1/64" step, one step short of its length', () => {
    // 7023100 - 3175 = 7019925 (34-35/64") off leaves 3175 units, one 1/64" step.
    const r = pushPull(project(), top(), "end1", -7_019_925, shop);
    if (!r.ok) throw new Error(r.message);
    expect(board("Top", r.edit.project).size.length).toBe(3_175);
  });
});

describe("pushPull() on a side, where the board's length runs up the case", () => {
  // From the orientation table, not the solve. The Right side stands at orientation 17
  // (STANDING_ACROSS): ADR 003 row 17 sends local X (length) to +Z and local Y (width) to +Y, so
  // end1 is its top (max z), end0 its bottom, edge1 its front (max y), edge0 its back. The Left
  // side is orientation 23 (X to -Z, Y to +Y), mirrored: ADR 013, D2 reflects a mirrored board
  // across its local Y-Z plane, flipping its length, so its length also runs to +Z and the faces
  // map the same way.
  const cases = [
    { side: "Right side", face: "end1", axis: 2, moved: "max", fixed: "min", sign: 1 },
    { side: "Right side", face: "end0", axis: 2, moved: "min", fixed: "max", sign: -1 },
    { side: "Right side", face: "edge1", axis: 1, moved: "max", fixed: "min", sign: 1 },
    { side: "Right side", face: "edge0", axis: 1, moved: "min", fixed: "max", sign: -1 },
    { side: "Left side", face: "end1", axis: 2, moved: "max", fixed: "min", sign: 1 },
    { side: "Left side", face: "end0", axis: 2, moved: "min", fixed: "max", sign: -1 },
    { side: "Left side", face: "edge1", axis: 1, moved: "max", fixed: "min", sign: 1 },
    { side: "Left side", face: "edge0", axis: 1, moved: "min", fixed: "max", sign: -1 },
  ] as const;

  it.each(cases)(
    'pulling $side $face moves that face by exactly 1" and keeps the opposite face',
    ({ side, face, axis, moved, fixed, sign }) => {
      const before = board(side);
      const r = pushPull(project(), before, face, IN, shop);
      if (!r.ok) throw new Error(r.message);
      const after = board(side, r.edit.project);
      expect(after.box[fixed][axis]).toBe(before.box[fixed][axis]);
      expect(after.box[moved][axis]).toBe((before.box[moved][axis] ?? 0) + sign * IN);
    },
  );

  it("does not change the other two directions of the board", () => {
    const before = board("Left side");
    const r = pushPull(project(), before, "end1", IN, shop);
    if (!r.ok) throw new Error(r.message);
    const after = board("Left side", r.edit.project);
    expect(after.box.min[0]).toBe(before.box.min[0]);
    expect(after.box.max[0]).toBe(before.box.max[0]);
    expect(after.box.min[1]).toBe(before.box.min[1]);
    expect(after.box.max[1]).toBe(before.box.max[1]);
  });
});

describe("faceOf()", () => {
  it("says a face along the thickness is locked", () => {
    expect(faceOf(top(), top().frame.z)).toBe("thickness");
  });

  it("finds the second end from its outward direction", () => {
    expect(faceOf(top(), top().frame.x)).toBe("end1");
  });

  it("finds the first end, and both edges", () => {
    const { x, y } = top().frame;
    expect(faceOf(top(), [-x[0], -x[1], -x[2]])).toBe("end0");
    expect(faceOf(top(), y)).toBe("edge1");
    expect(faceOf(top(), [-y[0], -y[1], -y[2]])).toBe("edge0");
  });
});

describe("travelAlong()", () => {
  it('measures a drag of 1" outward along +x', () => {
    expect(travelAlong([0, 0, 0], [IN, 5, 7], [1, 0, 0])).toBe(IN);
  });

  it("measures a drag inward as negative", () => {
    expect(travelAlong([IN, 0, 0], [0, 0, 0], [1, 0, 0])).toBe(-IN);
  });
});

describe("the Push/Pull tool", () => {
  const started = () => {
    const s = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setTool("pushPull");
    return s;
  };
  const endOf = (placed: PlacedPart): ModelHit => ({
    placed,
    point: [0, 0, 0],
    normal: placed.frame.x,
  });
  const event = (kind: ModelPointer["kind"], hit: ModelHit | null): ModelPointer => ({
    kind,
    hit,
    ray: null,
    shift: false,
    ctrl: false,
  });
  const lengthOfTop = (s: ReturnType<typeof started>) => {
    const solved = s.getState().solved;
    return solved?.result.placements.find((p) => p.partName === "Top")?.size.length;
  };

  it("tells the user a thickness face is set by the stock", () => {
    const s = started();
    const hit = { ...endOf(top()), normal: top().frame.z };
    pushPullTool.pointer?.(event("down", hit), s);
    expect(s.getState().notice?.text).toBe(
      "A board's thickness is set by its stock. Pick an end or an edge.",
    );
    expect(s.getState().pending).toBeNull();
  });

  it("drops an end clicked earlier when a broad face is pressed next, so a typed distance changes nothing", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    pushPullTool.pointer?.(event("up", endOf(top())), s);
    pushPullTool.pointer?.(event("down", { ...endOf(top()), normal: top().frame.z }), s);
    expect(s.getState().pending).toBeNull();
    expect(pushPullTool.measure?.('1"', s)).toBe("Click an end or edge of a board first.");
    // The top is as the form made it: 34-9/16" long (7023100 units).
    expect(lengthOfTop(s)).toBe(7_023_100);
  });

  it("asks for an end or edge first when a distance is typed too early", () => {
    expect(pushPullTool.measure?.('1"', started())).toBe("Click an end or edge of a board first.");
  });

  it("changes the length by a typed distance, taking the board over with a notice", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    expect(pushPullTool.measure?.('1"', s)).toBeNull();
    expect(lengthOfTop(s)).toBe(7_023_100 + IN);
    // A top 1" longer runs into the Left side; the change is recorded and what it caused is
    // named, as ADR 015, rule 13 words it ("Shelf 2 now overlaps Back; Undo puts it back.").
    expect(s.getState().notice).toEqual({
      text:
        "Top is now custom; the form won't change it. Top now overlaps Left side; " +
        "Undo puts it back.",
      kind: "undo",
    });
    expect(s.getState().pending).toBeNull();
  });

  it("refuses a typed distance that is not a length", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    expect(pushPullTool.measure?.("abc", s)).toBe('Unknown name "abc"');
    expect(s.getState().pending?.tool).toBe("pushPull");
  });

  it("previews a drag and records it once on release", () => {
    const s = started();
    const placed = top();
    pushPullTool.pointer?.(event("down", endOf(placed)), s);
    const k = placed.frame.x.findIndex((n) => n !== 0);
    const point: [number, number, number] = [0, 0, 0];
    point[k] = IN * (placed.frame.x[k] ?? 0);
    const moved = { ...endOf(placed), point };
    pushPullTool.pointer?.(event("move", moved), s);
    expect(s.getState().previewed).not.toBeNull();
    const before = s.getState().history?.entries.length;
    pushPullTool.pointer?.(event("up", moved), s);
    expect(s.getState().history?.entries.length).toBe((before ?? 0) + 1);
    expect(lengthOfTop(s)).toBe(7_023_100 + IN);
    expect(s.getState().pending).toBeNull();
  });

  it("records nothing when a drag ends where it started", () => {
    const s = started();
    const before = s.getState().history?.entries.length;
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    pushPullTool.pointer?.(event("up", endOf(top())), s);
    expect(s.getState().history?.entries.length).toBe(before);
  });

  it("keeps a shelf picked after taking it out of its row", () => {
    const s = started();
    const shelf = solve(
      s.getState().history?.entries[0]?.project ?? project(),
      shop,
    ).placements.find((p) => p.partName === "Shelf");
    if (!shelf) throw new Error("no shelf");
    s.getState().select({ kind: "boards", instances: [shelf.instance] });
    pushPullTool.pointer?.(event("down", endOf(shelf)), s);
    expect(pushPullTool.measure?.('1"', s)).toBeNull();
    const sel = s.getState().selection;
    expect(sel.kind).toBe("boards");
    const ids = sel.kind === "boards" ? sel.instances : [];
    const now = s.getState().solved?.result.placements.filter((p) => ids.includes(p.instance));
    expect(now?.length).toBe(1);
    expect(now?.[0]?.partName).toMatch(/^Shelf/);
    expect(now?.[0]?.size.length).toBe(shelf.size.length + IN);
  });

  const alongPoint = (placed: PlacedPart, inches: number): [number, number, number] => {
    const point: [number, number, number] = [0, 0, 0];
    const k = placed.frame.x.findIndex((n) => n !== 0);
    point[k] = inches * IN * (placed.frame.x[k] ?? 0);
    return point;
  };
  const at = (placed: PlacedPart, inches: number): ModelHit => ({
    ...endOf(placed),
    point: alongPoint(placed, inches),
  });
  const entries = (s: ReturnType<typeof started>) => s.getState().history?.entries.length;

  it("records nothing and shows no preview when a drag moves and returns to zero", () => {
    const s = started();
    const placed = top();
    const before = entries(s);
    pushPullTool.pointer?.(event("down", at(placed, 0)), s);
    pushPullTool.pointer?.(event("move", at(placed, 1)), s);
    expect(s.getState().previewed).not.toBeNull();
    pushPullTool.pointer?.(event("move", at(placed, 0)), s);
    expect(s.getState().previewed).toBeNull();
    pushPullTool.pointer?.(event("up", at(placed, 0)), s);
    expect(entries(s)).toBe(before);
    expect(s.getState().previewed).toBeNull();
    expect(s.getState().notice).toBeNull();
    expect(s.getState().pending).toBeNull();
    expect(lengthOfTop(s)).toBe(7_023_100);
  });

  it("records nothing and keeps the pick for typing when a click moves nowhere", () => {
    const s = started();
    const before = entries(s);
    pushPullTool.pointer?.(event("down", at(top(), 0)), s);
    pushPullTool.pointer?.(event("move", at(top(), 0)), s);
    pushPullTool.pointer?.(event("up", at(top(), 0)), s);
    expect(entries(s)).toBe(before);
    expect(s.getState().notice).toBeNull();
    expect(s.getState().pending?.tool).toBe("pushPull");
  });

  it("refuses a typed zero and leaves the board with the form", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", at(top(), 0)), s);
    const before = entries(s);
    expect(pushPullTool.measure?.('0"', s)).toBe("A distance of zero changes nothing.");
    expect(entries(s)).toBe(before);
    expect(s.getState().notice).toBeNull();
    expect(s.getState().history?.entries[0]?.project.parts.some((d) => d.detached)).toBeFalsy();
  });

  it("explains a refused release, records nothing and leaves no preview", () => {
    const s = started();
    const placed = top();
    const before = entries(s);
    pushPullTool.pointer?.(event("down", at(placed, 0)), s);
    pushPullTool.pointer?.(event("move", at(placed, 1)), s);
    pushPullTool.pointer?.(event("move", at(placed, -40)), s);
    expect(s.getState().previewed).not.toBeNull();
    pushPullTool.pointer?.(event("up", at(placed, -40)), s);
    expect(s.getState().notice?.text).toBeTruthy();
    expect(s.getState().previewed).toBeNull();
    expect(entries(s)).toBe(before);
    expect(s.getState().pending).toBeNull();
  });

  it("explains a drag pushed straight to nothing and released", () => {
    const s = started();
    const placed = top();
    pushPullTool.pointer?.(event("down", at(placed, 0)), s);
    pushPullTool.pointer?.(event("up", at(placed, -40)), s);
    expect(s.getState().notice?.text).toBeTruthy();
    expect(s.getState().pending).toBeNull();
  });

  describe("by the pointer's line of sight", () => {
    // The top's length runs along project x (scene x), so a sight line straight down the scene's z
    // at scene x = n meets the top's end line at n inches.
    const sight = (x: number) => ({ origin: [x, 5, 50], dir: [0, 0, -1] }) as const;
    const seen = (kind: ModelPointer["kind"], x: number, h: ModelHit | null = null) =>
      ({ kind, hit: h, ray: sight(x), shift: false, ctrl: false }) satisfies ModelPointer;

    it("lengthens by the distance the sight line travelled, and records a release off the boards", () => {
      const s = started();
      const placed = top();
      expect(placed.frame.x).toEqual([1, 0, 0]);
      pushPullTool.pointer?.(seen("down", 0, endOf(placed)), s);
      pushPullTool.pointer?.(seen("move", 1), s);
      expect(s.getState().previewed).not.toBeNull();
      pushPullTool.pointer?.(seen("up", 1), s);
      expect(lengthOfTop(s)).toBe(7_023_100 + IN);
      expect(s.getState().history?.entries.at(-1)?.label).toBe('Lengthened Top by 1"');
    });

    it("does not add up: the same sight line twice previews the same length", () => {
      const s = started();
      pushPullTool.pointer?.(seen("down", 0, endOf(top())), s);
      pushPullTool.pointer?.(seen("move", 1), s);
      const once = s.getState().previewed;
      pushPullTool.pointer?.(seen("move", 1), s);
      expect(s.getState().previewed).toBe(once);
    });

    it("shortens when the sight line travels back the other way", () => {
      const s = started();
      pushPullTool.pointer?.(seen("down", 0, endOf(top())), s);
      pushPullTool.pointer?.(seen("move", -1), s);
      pushPullTool.pointer?.(seen("up", -1), s);
      expect(lengthOfTop(s)).toBe(7_023_100 - IN);
    });
  });

  it("drops the preview when the drag is released off the model", () => {
    const s = started();
    const placed = top();
    const before = entries(s);
    pushPullTool.pointer?.(event("down", at(placed, 0)), s);
    pushPullTool.pointer?.(event("move", at(placed, 1)), s);
    pushPullTool.pointer?.(event("up", null), s);
    expect(s.getState().previewed).toBeNull();
    expect(entries(s)).toBe(before);
    expect(s.getState().pending).toBeNull();
  });
});
