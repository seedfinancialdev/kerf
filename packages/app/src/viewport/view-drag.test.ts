// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// SketchUp navigation (Interaction spec, "3D tools"): middle-drag orbits, Shift+middle-drag pans,
// and after O or H the left button does. A drag the window loses must not keep turning the view
// Orbit turns 0.01 radian per pixel (camera.ts), so 10 px = 0.1 rad.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { View } from "./camera";
import { listenForViewDrags } from "./view-drag";

const START: View = { target: [0, 0, 0], distance: 100, yaw: 0, pitch: 0 };
const pointer = (type: string, x: number, button = 0, shiftKey = false) =>
  Object.assign(new MouseEvent(type, { clientX: x, clientY: 0, button, shiftKey }), {
    pointerId: 1,
  }) as unknown as PointerEvent;

let stop = (): void => undefined;
afterEach(() => stop());

function listening(mode: "orbit" | "pan" | null = null) {
  const el = document.createElement("canvas");
  el.setPointerCapture = vi.fn();
  let view = START;
  stop = listenForViewDrags(el, {
    mode,
    height: 200,
    change: (update) => {
      view = update(view);
    },
  });
  return { el, view: () => view };
}

describe("listenForViewDrags()", () => {
  it("orbits on a middle-button drag: 10 px turns the view 0.1 radian", () => {
    const { el, view } = listening();
    el.dispatchEvent(pointer("pointerdown", 0, 1));
    window.dispatchEvent(pointer("pointermove", 10, 1));
    expect(view().yaw).toBeCloseTo(-0.1, 10);
  });

  it("orbits with the left button only after O", () => {
    const picking = listening();
    picking.el.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 10, 0));
    expect(picking.view()).toEqual(START);
    stop();
    const orbiting = listening("orbit");
    orbiting.el.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 10, 0));
    expect(orbiting.view().yaw).not.toBe(0);
  });

  it("captures the pointer, so the drag goes on outside the canvas", () => {
    const { el } = listening();
    el.dispatchEvent(pointer("pointerdown", 0, 1));
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it.each([
    ["the release", () => window.dispatchEvent(pointer("pointerup", 10, 1))],
    ["a cancelled pointer", (el: HTMLElement) => el.dispatchEvent(pointer("pointercancel", 10))],
    ["a lost capture", (el: HTMLElement) => el.dispatchEvent(pointer("lostpointercapture", 10))],
    ["the window losing focus", () => window.dispatchEvent(new Event("blur"))],
  ])("stops turning the view after %s", (_, ending) => {
    const { el, view } = listening();
    el.dispatchEvent(pointer("pointerdown", 0, 1));
    ending(el);
    window.dispatchEvent(pointer("pointermove", 10, 0));
    expect(view()).toEqual(START);
  });

  it("starts no drag when the pointer is already gone", () => {
    const { el, view } = listening();
    el.setPointerCapture = vi.fn(() => {
      throw new DOMException("No active pointer with the given id is found.", "NotFoundError");
    });
    el.dispatchEvent(pointer("pointerdown", 0, 1));
    window.dispatchEvent(pointer("pointermove", 10, 1));
    expect(view()).toEqual(START);
  });
});
