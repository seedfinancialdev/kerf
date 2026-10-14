// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "History panel": "a readable list of every change … click any entry to step
// back, like Photoshop's History". ADR 015, rule 1 (session only, last 200 changes).

import type { Project } from "@kerf/core";
import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  currentProject,
  HISTORY_LIMIT,
  jumpTo,
  record,
  redo,
  startHistory,
  undo,
} from "./history";

const p = (name: string): Project => ({
  schemaVersion: 1,
  name,
  units: "imperial",
  params: [],
  stock: [],
  parts: [],
  instances: [],
  patterns: [],
  joints: [],
  matchSets: [],
  structures: [],
});
const edit = (label: string) => ({ label, project: p(label) });

describe("history", () => {
  it("starts with one entry and nothing to undo", () => {
    const h = startHistory(edit("New bookcase"));
    expect(h.entries.map((e) => e.label)).toEqual(["New bookcase"]);
    expect(canUndo(h)).toBe(false);
  });

  it("undoes and redoes one change", () => {
    const h = record(startHistory(edit("New bookcase")), edit('Width 36" → 30"'));
    expect(currentProject(undo(h)).name).toBe("New bookcase");
    expect(currentProject(redo(undo(h))).name).toBe('Width 36" → 30"');
  });

  it("drops the later entries when a change is made after stepping back", () => {
    let h = startHistory(edit("a"));
    h = record(record(h, edit("b")), edit("c"));
    h = record(jumpTo(h, 0), edit("d"));
    expect(h.entries.map((e) => e.label)).toEqual(["a", "d"]);
    expect(canRedo(h)).toBe(false);
  });

  it("steps back to any entry", () => {
    let h = startHistory(edit("a"));
    h = record(record(h, edit("b")), edit("c"));
    expect(currentProject(jumpTo(h, 1)).name).toBe("b");
  });

  it("ignores undo at the start and redo at the end", () => {
    const h = startHistory(edit("a"));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("refuses to jump to an entry that does not exist", () => {
    expect(() => jumpTo(startHistory(edit("a")), 5)).toThrow(RangeError);
  });

  it("jumps to the last entry, and refuses one past it and one before the first", () => {
    const h = record(record(startHistory(edit("a")), edit("b")), edit("c"));
    expect(currentProject(jumpTo(undo(h), h.entries.length - 1)).name).toBe("c");
    expect(() => jumpTo(h, h.entries.length)).toThrow(RangeError);
    expect(() => jumpTo(h, -1)).toThrow(RangeError);
  });

  it("keeps the last 200 changes, dropping the oldest", () => {
    let h = startHistory(edit("0"));
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) h = record(h, edit(String(i)));
    expect(h.entries).toHaveLength(HISTORY_LIMIT);
    expect(h.entries[0]?.label).toBe("6");
    // The newest of 200 entries is at index 199.
    expect(h.at).toBe(HISTORY_LIMIT - 1);
    expect(currentProject(h).name).toBe(String(HISTORY_LIMIT + 5));
  });

  it("drops only the entries after the one stepped back to when the full History changes", () => {
    // 200 entries labelled 6..205; stepping back to index 100 (label 106) and changing keeps
    // indexes 0..100 (101 entries) plus the change: 102, and the oldest is still 6.
    let h = startHistory(edit("0"));
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) h = record(h, edit(String(i)));
    h = record(jumpTo(h, 100), edit("new"));
    expect(h.entries).toHaveLength(102);
    expect(h.entries[0]?.label).toBe("6");
    expect(h.entries[100]?.label).toBe("106");
    expect(h.at).toBe(101);
  });
});
