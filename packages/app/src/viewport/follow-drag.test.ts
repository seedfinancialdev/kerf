// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A drag that a tool has begun is followed by the canvas, wherever the pointer goes; a click is not
// a drag. The camera looks down the scene's −z from 50 inches, so a pointer 20 px above the middle
// of a 200 px canvas sights a different height than the middle does.

import type { PlacedPart } from "@kerf/core";
import { PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { setSize, startProject } from "../model/commands";
import type { Pending } from "../model/pending";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { moveTool } from "../tools/move";
import { followDrag, followsDrag } from "./follow-drag";
import { sightLine } from "./sight-line";

function canvas() {
  const el = document.createElement("canvas");
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  return el;
}
const camera = () => {
  const c = new PerspectiveCamera(50, 1, 0.1, 1000);
  c.position.set(0, 0, 50);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
};
const pointer = (type: string, x: number, y: number, pointerId = 1) =>
  Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), {
    pointerId,
  }) as unknown as PointerEvent;

/** The bookcase, then Width 30" when `resized`, so there is an entry to undo. */
function started(resized = false) {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  const project = shownProject(store.getState());
  const wider = project && setSize(project, project.structures[0]?.id ?? "", "w", '30"');
  if (resized && wider?.ok) store.getState().apply(wider.edit);
  const top = store
    .getState()
    .solved?.result.placements.find((p) => p.partName === "Top") as PlacedPart;
  store.getState().setTool("move");
  store.getState().select({ kind: "boards", instances: [top.instance] });
  return { store, top };
}

/** Begins a Move of the top under an up-direction lock, the way the viewport does on a press. */
function begin(x = 100, y = 100, el = canvas(), resized = false) {
  const { store, top } = started(resized);
  const cam = camera();
  const down = pointer("pointerdown", x, y);
  store
    .getState()
    .setPending({ tool: "move", from: [0, 0, 0], ray: null, placed: [], axis: 2, last: null });
  moveTool.pointer?.(
    {
      kind: "down",
      hit: { placed: top, point: [0, 0, 0], normal: top.frame.z },
      ray: sightLine(down, el, cam),
      shift: false,
      ctrl: false,
    },
    store,
  );
  followDrag(store, down, el, cam);
  return { store, el, cam };
}
const entries = (s: ReturnType<typeof started>["store"]) => s.getState().history?.entries.length;

describe("followDrag()", () => {
  it("captures the pointer that went down", () => {
    const { el } = begin();
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("forwards moves from that pointer, with a line of sight, and ignores others", () => {
    const { store, el } = begin();
    el.dispatchEvent(pointer("pointermove", 100, 80, 2));
    expect(store.getState().previewed).toBeNull();
    el.dispatchEvent(pointer("pointermove", 100, 80));
    expect(store.getState().previewed).not.toBeNull();
  });

  it("records a drag on release, releases the capture and stops listening", () => {
    const { store, el } = begin();
    const before = entries(store);
    el.dispatchEvent(pointer("pointermove", 100, 80));
    el.dispatchEvent(pointer("pointerup", 100, 80));
    expect(entries(store)).toBe((before ?? 0) + 1);
    expect(store.getState().history?.entries.at(-1)?.label).toMatch(/^Moved Top /);
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1);
    el.dispatchEvent(pointer("pointermove", 100, 60));
    expect(store.getState().previewed).toBeNull();
  });

  it("ignores the release of another pointer", () => {
    const { store, el } = begin();
    el.dispatchEvent(pointer("pointermove", 100, 80));
    el.dispatchEvent(pointer("pointerup", 100, 80, 2));
    expect(el.releasePointerCapture).not.toHaveBeenCalled();
    expect(store.getState().previewed).not.toBeNull();
  });

  it("records nothing for a press and release at the same pixel", () => {
    const { store, el } = begin();
    const before = entries(store);
    el.dispatchEvent(pointer("pointerup", 100, 100));
    expect(entries(store)).toBe(before);
    expect(store.getState().notice).toBeNull();
  });

  it("records nothing for a release one pixel away: still a click", () => {
    const { store, el } = begin();
    const before = entries(store);
    el.dispatchEvent(pointer("pointermove", 100, 99));
    el.dispatchEvent(pointer("pointerup", 100, 99));
    expect(entries(store)).toBe(before);
  });

  it.each(["pointercancel", "lostpointercapture"])(
    "drops the preview and the pending move on %s, recording nothing",
    (type) => {
      const { store, el } = begin();
      const before = entries(store);
      el.dispatchEvent(pointer("pointermove", 100, 80));
      expect(store.getState().previewed).not.toBeNull();
      el.dispatchEvent(pointer(type, 100, 80));
      expect(store.getState().previewed).toBeNull();
      expect(store.getState().pending).toBeNull();
      expect(entries(store)).toBe(before);
    },
  );
});

describe("a drag the store cancels (final branch review I1, silent-failure review I5)", () => {
  const dragged = (resized = false) => {
    const { store, el } = begin(100, 100, canvas(), resized);
    el.dispatchEvent(pointer("pointermove", 100, 80));
    expect(store.getState().previewed).not.toBeNull();
    return { store, el, before: entries(store) };
  };

  it("stops when the tool changes: the release records nothing and the capture is let go", () => {
    const { store, el, before } = dragged();
    store.getState().setTool("select");
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1);
    store.getState().setTool("move");
    el.dispatchEvent(pointer("pointermove", 100, 60));
    el.dispatchEvent(pointer("pointerup", 100, 60));
    expect(store.getState().previewed).toBeNull();
    expect(entries(store)).toBe(before);
  });

  it("stops when History moves under it, so the redo entry is kept", () => {
    const { store, el } = dragged(true);
    store.getState().undo();
    el.dispatchEvent(pointer("pointermove", 100, 60));
    el.dispatchEvent(pointer("pointerup", 100, 60));
    // Two entries (New bookcase, Width 30"), showing the first: Redo still has the second.
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 30"',
    ]);
    expect(store.getState().history?.at).toBe(0);
    expect(store.getState().previewed).toBeNull();
  });

  it("stops and drops its preview when O makes left-drag orbit, recording nothing", () => {
    const { store, el, before } = dragged();
    store.getState().setNavigation("orbit");
    expect(store.getState().previewed).toBeNull();
    expect(store.getState().pending).toBeNull();
    el.dispatchEvent(pointer("pointermove", 100, 60));
    el.dispatchEvent(pointer("pointerup", 100, 60));
    expect(store.getState().previewed).toBeNull();
    expect(entries(store)).toBe(before);
  });
});

describe("a press whose pointer is already gone (silent-failure review M7)", () => {
  it("is not followed, does not throw, and keeps the click's pending move", () => {
    const el = canvas();
    el.setPointerCapture = vi.fn(() => {
      throw new DOMException("No active pointer with the given id is found.", "NotFoundError");
    });
    const { store } = begin(100, 100, el);
    el.dispatchEvent(pointer("pointermove", 100, 80));
    expect(store.getState().previewed).toBeNull();
    expect(store.getState().pending).toMatchObject({ tool: "move", axis: 2 });
  });
});

describe("followsDrag()", () => {
  const state = (pending: Pending | null, navigation: "orbit" | "pan" | null = null) => {
    const s = createKerfStore({ storage: createStorage(memoryStorage()) }).getState();
    return { ...s, pending, navigation };
  };
  const { top } = started();
  const hit = { placed: top, point: [0, 0, 0] as const, normal: top.frame.x };

  it.each<[string, Pending]>([
    ["Push/Pull", { tool: "pushPull", hit, dragged: null, ray: null }],
    ["Move", { tool: "move", from: [0, 0, 0], ray: null, placed: [], axis: null, last: null }],
  ])("follows a press of %s, the tools that drag", (_, pending) => {
    expect(followsDrag(state(pending))).toBe(true);
  });

  it.each<[string, Pending | null]>([
    ["Join's first board", { tool: "join", first: "a" }],
    ["the Tape's first point", { tool: "tape", from: [0, 0, 0] }],
    ["Board's first click", { tool: "board", from: { placed: null, point: [0, 0, 0] } }],
    ["nothing under way", null],
  ])("leaves %s alone, so a cancelled pointer cannot clear it", (_, pending) => {
    expect(followsDrag(state(pending))).toBe(false);
  });

  it("follows nothing while left-drag orbits or pans the view", () => {
    const move: Pending = {
      tool: "move",
      from: [0, 0, 0],
      ray: null,
      placed: [],
      axis: null,
      last: null,
    };
    expect(followsDrag(state(move, "orbit"))).toBe(false);
    expect(followsDrag(state(move, "pan"))).toBe(false);
  });
});
