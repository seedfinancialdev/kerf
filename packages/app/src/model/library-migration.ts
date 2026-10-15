// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Older Kerf kept one project in browser storage (`kerf.project`). It moves into the library once
// (ADR 016, D5) and is removed from storage only after the library has it: a project the library
// cannot keep, or the browser would not let be read, stays where it is.

import { type Id, serializeProject } from "@kerf/core";
import { currentProject } from "./history";
import type { Library } from "./library";
import { restoreProject } from "./persist";
import type { AppStorage } from "./storage";

/**
 * The library id of the project older Kerf kept in browser storage (Ruling R14). It is fixed so a
 * migration that runs again, because storage would not let the old project go, replaces this entry
 * instead of adding a second one. A valid ULID, so it is a legal id.
 */
export const MIGRATED_PROJECT_ID: Id = "00000000KERF0M45PRJ0000000";

/** What happened to the stored project, and what to tell the user when something is wrong. */
export interface MigrationResult {
  outcome: "none" | "moved" | "kept";
  /** In shop words: the stored project was damaged, from a newer Kerf, or could not be read. */
  problem?: string;
}

/**
 * Moves the project in browser storage into `library`, named as the project, created when first
 * saved (`kerf.created`, else `now`) and last changed `now`. Outcomes: "moved" once the library has
 * it and storage no longer does; "kept" when it stays in storage (the library refused it, or the
 * browser would not let it be read); "none" when there was nothing to move, including a damaged
 * project, which `restoreProject` sets aside. `problem` carries what `restoreProject` says about a
 * stored project that could not be opened. If the library already
 * has the entry (an earlier run moved it but storage would not let the project go), nothing is
 * written, so work done on it since is never overwritten; the removal is tried again and the
 * outcome is "moved" again. Never throws.
 */
export async function migrateStoredProject(
  storage: AppStorage,
  library: Library,
  now: Date,
): Promise<MigrationResult> {
  const { history, problem } = restoreProject(storage);
  if (!history) {
    const outcome = storage.couldNotRead("kerf.project") ? "kept" : "none";
    return problem === undefined ? { outcome } : { outcome, problem };
  }
  if (await library.read(MIGRATED_PROJECT_ID)) {
    storage.remove("kerf.project");
    return { outcome: "moved" };
  }
  const project = currentProject(history);
  const time = now.toISOString();
  const kept = await library.write({
    id: MIGRATED_PROJECT_ID,
    name: project.name,
    project: serializeProject(project),
    thumbnail: null,
    created: storage.read("kerf.created") ?? time,
    modified: time,
    note: "",
  });
  if (!kept) return { outcome: "kept" };
  storage.remove("kerf.project");
  return { outcome: "moved" };
}
