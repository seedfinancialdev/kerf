// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a drag going once a tool has begun one: the canvas captures the pointer, so the tool hears
// every move and the release even when the pointer leaves the boards or the canvas.

import { type Camera, Raycaster, Vector2 } from "three";
import type { Ray } from "../model/pending";
import type { KerfStore } from "../model/store";
import { dispatchDrag } from "../tools/dispatch";

/** The line of sight under a pointer event, in scene inches. */
function rayOf(e: PointerEvent, canvas: HTMLElement, camera: Camera): Ray {
  const box = canvas.getBoundingClientRect();
  const at = new Vector2(
    ((e.clientX - box.left) / box.width) * 2 - 1,
    -((e.clientY - box.top) / box.height) * 2 + 1,
  );
  const caster = new Raycaster();
  caster.setFromCamera(at, camera);
  return { origin: caster.ray.origin.toArray(), dir: caster.ray.direction.toArray() };
}

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
  const keys = (e: PointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  const move = (e: PointerEvent): void => {
    if (e.pointerId === down.pointerId)
      dispatchDrag(store, "move", rayOf(e, canvas, camera), keys(e));
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
    dispatchDrag(store, "up", rayOf(e, canvas, camera), keys(e));
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
