// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Push/Pull": "Change a part's length or width; thickness is locked to the
// stock." Editing a form's board detaches only that board (Interaction spec, "Tweak").

import { type PlacedPart, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import type { ModelHit, ModelPointer } from "./pointer";
import { faceOf, pushPull, pushPullTool, travelAlong } from "./push-pull";

const shop = loadShopProfile();
const IN = 203_200;
const project = () => startProject("Bookcase", "imperial").project;
const board = (name: string, p = project()): PlacedPart => {
  const found = solve(p, shop).placements.find((x) => x.partName === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const top = () => board("Top");

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

  it("refuses to push a board to nothing", () => {
    const r = pushPull(project(), top(), "end1", -40 * IN, shop);
    expect(r.ok).toBe(false);
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
    const s = createKerfStore({ storage: createStorage(memoryStorage()) });
    s.getState().apply(startProject("Bookcase", "imperial"));
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

  it("asks for an end or edge first when a distance is typed too early", () => {
    expect(pushPullTool.measure?.('1"', started())).toBe("Click an end or edge of a board first.");
  });

  it("changes the length by a typed distance, taking the board over with a notice", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    expect(pushPullTool.measure?.('1"', s)).toBeNull();
    expect(lengthOfTop(s)).toBe(7_023_100 + IN);
    expect(s.getState().notice).toEqual({
      text: "Top is now custom; the form won't change it.",
      undo: true,
    });
    expect(s.getState().pending).toBeNull();
  });

  it("refuses a typed distance that is not a length", () => {
    const s = started();
    pushPullTool.pointer?.(event("down", endOf(top())), s);
    expect(pushPullTool.measure?.("abc", s)).not.toBeNull();
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
});
