// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a drag going once a tool has begun one: the canvas captures the pointer, so the tool hears
// every move and the release even when the pointer leaves the boards or the canvas.

import type { Camera } from "three";
import type { KerfStore } from "../model/store";
import { dispatchDrag } from "../tools/dispatch";
import { sightLine } from "./sight-line";

/** How far the pointer must travel before a press is a drag and not a click. */
const DRAG_PIXELS = 3;

/**
 * Follows `down`'s pointer on `canvas` until it is released or taken away. A release goes to the
 * tool; a cancelled pointer (the browser took it) records nothing and drops the preview.
 */
export function followDrag(
  store: KerfStore,
  down: PointerEvent,
  canvas: HTMLElement,
  camera: Camera,
): void {
  canvas.setPointerCapture(down.pointerId);
  const began = sightLine(down, canvas, camera);
  let dragged = false;
  const keys = (e: PointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId) return;
    dragged ||= Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) >= DRAG_PIXELS;
    if (dragged) dispatchDrag(store, "move", sightLine(e, canvas, camera), keys(e));
  };
  const end = (): void => {
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", cancel);
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId) return;
    end();
    // A click that never left its pixel is released where it began, so it moves nothing.
    dispatchDrag(store, "up", dragged ? sightLine(e, canvas, camera) : began, keys(e));
    canvas.releasePointerCapture(down.pointerId);
  };
  const cancel = (): void => {
    end();
    store.getState().cancelPreview();
    store.getState().setPending(null);
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
}
