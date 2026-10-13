// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the model view tells a tool: which board was hit, where (project units, on the grid) and
// which way the surface faces (a project axis). Each tool turns this into named changes.

import type { PlacedPart, Vec3 } from "@kerf/core";
import type { KerfState, KerfStore, ToolId } from "../model/store";

export interface ModelHit {
  placed: PlacedPart;
  point: Vec3;
  /** The surface's outward direction: a signed project axis. */
  normal: Vec3;
}

export interface ModelPointer {
  kind: "down" | "move" | "up";
  hit: ModelHit | null;
  shift: boolean;
  ctrl: boolean;
}

export interface ToolHandler {
  pointer?(e: ModelPointer, store: KerfStore): void;
  /** Takes text typed in the Measurements box; returns why it was refused, or null. */
  measure?(text: string, store: KerfStore): string | null;
  /** What the Measurements box asks for now. */
  prompt?(state: KerfState): string;
}

const select: ToolHandler = {
  pointer(e, store) {
    if (e.kind !== "down") return;
    const s = store.getState();
    if (!e.hit) return s.select({ kind: "none" });
    const now = s.selection.kind === "boards" ? s.selection.instances : [];
    s.select({
      kind: "boards",
      instances: e.shift ? [...new Set([...now, e.hit.placed.instance])] : [e.hit.placed.instance],
    });
  },
};

/**
 * Every tool's handler, written out so the wiring is visible. A tool whose task has not landed yet
 * selects; Tasks 27-31 replace their entry and import their handler here. The Edge tool works from
 * the inspector (Task 26), so clicking boards while it is active picks them.
 */
const HANDLERS: Record<ToolId, ToolHandler> = {
  select,
  board: select,
  pushPull: select,
  move: select,
  join: select,
  edge: select,
  tape: select,
};

/** The handler for the active tool. */
export function handlerFor(tool: ToolId): ToolHandler {
  return HANDLERS[tool];
}
