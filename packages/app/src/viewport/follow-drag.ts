// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a drag going once a tool has begun one: the canvas captures the pointer, so the tool hears
// every move and the release even when the pointer leaves the boards or the canvas.

import type { Camera } from "three";
import type { KerfState, KerfStore } from "../model/store-types";
import { dispatchDrag } from "./dispatch";
import { sightLine } from "./sight-line";

/** How far the pointer must travel before a press is a drag and not a click. */
const DRAG_PIXELS = 3;

/**
 * True when a press on a board began something to drag: a Push/Pull or a Move, while the left
 * button picks. Join, Tape and Board wait for a second click, which a cancelled pointer must not
 * clear; after O or H the left button drags the view.
 */
export function followsDrag(state: KerfState): boolean {
  const tool = state.pending?.tool;
  return state.navigation === null && (tool === "pushPull" || tool === "move");
}

/**
 * True when the store has ended the drag's action: another tool, History moved, or navigation
 * began.
 */
function abandoned(now: KerfState, before: KerfState): boolean {
  return now.tool !== before.tool || now.pending === null || now.navigation !== null;
}

/**
 * Follows `down`'s pointer on `canvas` until it is released or taken away. A release goes to the
 * tool; a cancelled pointer (the browser took it) records nothing and drops the preview. A drag
 * whose action the store ends (the tool changes, History moves, O or H) stops at once, so its
 * release cannot record on top of the change. A pointer that is already
 * gone is not followed: the press stays a click.
 */
export function followDrag(
  store: KerfStore,
  down: PointerEvent,
  canvas: HTMLElement,
  camera: Camera,
): void {
  try {
    canvas.setPointerCapture(down.pointerId);
  } catch (error) {
    // NotFoundError or InvalidStateError: the pointer was released or taken before the capture.
    if (error instanceof DOMException) return;
    throw error;
  }
  const began = sightLine(down, canvas, camera);
  let dragged = false;
  const keys = (e: PointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId) return;
    dragged ||= Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) >= DRAG_PIXELS;
    if (dragged) dispatchDrag(store, "move", sightLine(e, canvas, camera), keys(e));
  };
  const end = (): void => {
    unsubscribe();
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
  const drop = (): void => {
    const s = store.getState();
    if (s.previewed) s.cancelPreview();
    if (s.pending) s.setPending(null);
  };
  const cancel = (): void => {
    end();
    drop();
  };
  const unsubscribe = store.subscribe((now, before) => {
    if (!abandoned(now, before)) return;
    end();
    drop();
    canvas.releasePointerCapture(down.pointerId);
  });
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
}
