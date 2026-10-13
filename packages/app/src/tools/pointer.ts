// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the model view tells a tool: which board was hit, where (project units, on the grid) and
// which way the surface faces (a project axis). Each tool turns this into named changes.

import type { ModelHit } from "../model/pending";
import type { ToolId } from "../model/store";
import { boardTool } from "./board";
import type { ModelPointer, ToolHandler } from "./handler";
import { moveTool } from "./move";
import { pushPullTool } from "./push-pull";

export type { ModelHit, ModelPointer, ToolHandler };

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
 * selects; Tasks 30-31 replace their entry and import their handler here. The Edge tool works from
 * the inspector (Task 26), so clicking boards while it is active picks them.
 */
const HANDLERS: Record<ToolId, ToolHandler> = {
  select,
  board: boardTool,
  pushPull: pushPullTool,
  move: moveTool,
  join: select,
  edge: select,
  tape: select,
};

/** The handler for the active tool. */
export function handlerFor(tool: ToolId): ToolHandler {
  return HANDLERS[tool];
}
