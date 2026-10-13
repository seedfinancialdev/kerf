// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The History list (Interaction spec, "History panel"; ADR 015, rule 1): one whole project per
// named change. Projects are small and immutable here, so keeping each one makes stepping back
// exact and simple. A value, never mutated: every function returns a new History.

import type { Project } from "@kerf/core";
import type { Edit } from "./commands";

/** One recorded change: the project as it stood after it, and its label. */
export interface HistoryEntry {
  readonly label: string;
  readonly project: Project;
}

/**
 * Every recorded change, oldest first, and which one is shown. Immutable; the functions here return
 * a new one.
 */
export interface History {
  readonly entries: readonly HistoryEntry[];
  /** The entry being shown. */
  readonly at: number;
}

/** How many changes are kept (ADR 015, rule 1); the oldest is dropped beyond this. */
export const HISTORY_LIMIT = 200;

/** A history whose only entry is `edit`, such as "New bookcase". */
export function startHistory(edit: Edit): History {
  return { entries: [{ label: edit.label, project: edit.project }], at: 0 };
}

/** Adds a change after the current entry, dropping any entries after it. */
export function record(history: History, edit: Edit): History {
  const kept = [
    ...history.entries.slice(0, history.at + 1),
    { label: edit.label, project: edit.project },
  ];
  const entries = kept.slice(Math.max(0, kept.length - HISTORY_LIMIT));
  return { entries, at: entries.length - 1 };
}

/** True when an earlier entry exists to step back to. */
export const canUndo = (h: History): boolean => h.at > 0;

/** True when a later entry exists to step forward to. */
export const canRedo = (h: History): boolean => h.at < h.entries.length - 1;

/** Steps back one entry; returns the same history at the start. */
export function undo(h: History): History {
  return canUndo(h) ? { ...h, at: h.at - 1 } : h;
}

/** Steps forward one entry; returns the same history at the end. */
export function redo(h: History): History {
  return canRedo(h) ? { ...h, at: h.at + 1 } : h;
}

/** Shows entry `index`. Throws RangeError for an index outside the list. */
export function jumpTo(h: History, index: number): History {
  if (!Number.isInteger(index) || index < 0 || index >= h.entries.length) {
    throw new RangeError(`History has no entry ${index}.`);
  }
  return { ...h, at: index };
}

/** The project at the entry being shown. */
export function currentProject(h: History): Project {
  const entry = h.entries[h.at];
  if (!entry) throw new RangeError("History is empty.");
  return entry.project;
}
