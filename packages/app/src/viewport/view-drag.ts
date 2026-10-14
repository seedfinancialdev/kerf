// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// SketchUp navigation by pointer (Interaction spec, "3D tools"): middle-drag orbits, Shift+middle-
// drag pans, the wheel zooms, and after O or H the left button orbits or pans.

import { orbit, pan, type View, zoom } from "./camera";

/** What a drag on the view does and how to change the view. */
export interface ViewDragOptions {
  /** What left-drag does: orbit after O, pan after H, nothing (picking) when null. */
  mode: "orbit" | "pan" | null;
  /** The canvas height in pixels, so a pan follows the cursor. */
  height: number;
  /** Changes the view. */
  change(update: (v: View) => View): void;
}

interface Drag {
  x: number;
  y: number;
  panning: boolean;
}

/**
 * Listens on `el` (and the window, for moves) for view drags and the wheel; returns a function that
 * stops listening. The canvas captures the dragging pointer, and a drag ends on release, on a
 * cancelled or lost pointer, or when the window loses focus, so a button let go outside the
 * browser never leaves the view turning with plain moves.
 */
export function listenForViewDrags(
  el: HTMLElement,
  { mode, height, change }: ViewDragOptions,
): () => void {
  let drag: Drag | null = null;
  const down = (e: PointerEvent): void => {
    const left = e.button === 0 && mode !== null;
    if (e.button === 1) e.preventDefault();
    if (e.button !== 1 && !left) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (error) {
      // NotFoundError or InvalidStateError: the pointer is already gone, so there is no drag.
      if (error instanceof DOMException) return;
      throw error;
    }
    drag = { x: e.clientX, y: e.clientY, panning: e.shiftKey || (left && mode === "pan") };
  };
  const move = (e: PointerEvent): void => {
    const d = drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag = { ...d, x: e.clientX, y: e.clientY };
    change((v) => (d.panning ? pan(v, dx, dy, height) : orbit(v, dx, dy)));
  };
  const end = (): void => {
    drag = null;
  };
  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    change((v) => zoom(v, e.deltaY));
  };
  el.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
  window.addEventListener("blur", end);
  el.addEventListener("wheel", wheel, { passive: false });
  return (): void => {
    el.removeEventListener("pointerdown", down);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    el.removeEventListener("lostpointercapture", end);
    window.removeEventListener("blur", end);
    el.removeEventListener("wheel", wheel);
  };
}
