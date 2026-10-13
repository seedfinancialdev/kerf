// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool handler receives and offers. Kept apart from the handler table (pointer.ts) so a
// tool can name these types without importing the table that imports it.

import type { Project } from "@kerf/core";
import type { ModelHit } from "../model/pending";
import type { KerfState, KerfStore } from "../model/store";

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

/** History's current project: drags and typed sizes are measured from what was recorded. */
export function recordedProject(store: KerfStore): Project | null {
  const h = store.getState().history;
  return h?.entries[h.at]?.project ?? null;
}
