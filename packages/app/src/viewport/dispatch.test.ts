// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Where scene floats become project integers: surface directions and the grid snap
// (Domain model, "Units & precision": the grid is 1/64" in inches and 0.01 mm in metric).

import { INCH } from "@kerf/core";
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { fromScene } from "../scene/frames";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { axisOf, dispatchDrag, dispatchPointer } from "./dispatch";

describe("axisOf()", () => {
  it("turns scene up into project up (z)", () => {
    expect(axisOf(0, 1, 0)).toEqual([0, 0, 1]);
  });

  it("turns scene −z (toward the viewer) into project front (y)", () => {
    expect(axisOf(0, 0, -1)).toEqual([0, 1, 0]);
  });

  it("keeps the sign and picks the biggest component", () => {
    expect(axisOf(-0.9, 0.2, 0.1)).toEqual([-1, 0, 0]);
  });
});

describe("fromScene()", () => {
  const grid = 3175; // 1/64"

  it("snaps to the nearest grid line: 0.51 inch is 32.64 sixty-fourths, so 33", () => {
    expect(fromScene([0.51, 0, 0], grid)[0]).toBe(33 * grid);
  });

  it("maps scene (x, y, z) to project (x, −z, y)", () => {
    expect(fromScene([1, 2, -3], grid)).toEqual([INCH, 3 * INCH, 2 * INCH]);
  });
});

describe("dispatchPointer()", () => {
  it("gives a click on empty space its line of sight from the view's camera", () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    store.getState().apply(startProject("Bookcase", "imperial"));
    store.getState().setTool("board");
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
    // Straight above scene (3, 0, 4), looking down: the middle of the canvas meets the floor
    // there, which is project (3", -4", 0).
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(3, 50, 4);
    camera.lookAt(3, 0, 4);
    camera.updateMatrixWorld();
    canvas.addEventListener("click", (e) => dispatchPointer(store, "down", e, null, camera));
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 100, clientY: 100 }));
    expect(store.getState().pending).toEqual({
      tool: "board",
      from: { placed: null, point: [3 * INCH, -4 * INCH, 0] },
    });
  });
});

describe("a click on empty space with a line of sight", () => {
  it.each(["move", "pushPull"] as const)("does nothing for the %s tool", (tool) => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    store.getState().apply(startProject("Bookcase", "imperial"));
    store.getState().setTool(tool);
    const before = store.getState().history?.entries.length;
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(3, 50, 4);
    camera.lookAt(3, 0, 4);
    camera.updateMatrixWorld();
    canvas.addEventListener("click", (e) => dispatchPointer(store, "down", e, null, camera));
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 100, clientY: 100 }));
    expect(store.getState().history?.entries.length).toBe(before);
    expect(store.getState().pending).toBeNull();
  });
});

describe("dispatchDrag() after O or H", () => {
  it("leaves a waiting Push/Pull alone, so orbiting the view records nothing", () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    store.getState().apply(startProject("Bookcase", "imperial"));
    store.getState().setTool("pushPull");
    const side = store.getState().solved?.result.placements.find((p) => p.partName === "Side");
    if (!side) throw new Error("no side");
    // A click on the side's top end, sighted at scene height 10", waiting for a distance; then O,
    // then a drag sighted 2" higher along the end's line (scene y is project z): a 2" pull.
    const end = { placed: side, point: [0, 0, side.box.max[2]] as const, normal: side.frame.x };
    const sighted = (y: number) => ({ origin: [0, y, 50] as const, dir: [0, 0, -1] as const });
    store.getState().setPending({ tool: "pushPull", hit: end, dragged: null, ray: sighted(10) });
    store.getState().setNavigation("orbit");
    const before = store.getState().history?.entries.length;
    const ray = sighted(12);
    dispatchDrag(store, "move", ray, { shift: false, ctrl: false });
    dispatchDrag(store, "up", ray, { shift: false, ctrl: false });
    expect(store.getState().previewed).toBeNull();
    expect(store.getState().history?.entries.length).toBe(before);
  });
});
