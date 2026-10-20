// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Older Kerf kept one project in browser storage (`kerf.project`). It moves into the library once
// (ADR 016, D5) and is removed from storage only after the library has it: a project the library
// cannot keep, or the browser would not let be read, stays where it is.

import { type Id, type Project, serializeProject } from "@kerf/core";
import { currentProject, type History } from "./history";
import { newId } from "./ids";
import type { Library } from "./library";
import { restoreProject } from "./persist";
import type { AppStorage } from "./storage";

/**
 * The library id of the project older Kerf kept in browser storage (Ruling R14). It is fixed so a
 * migration that runs again, because storage would not let the old project go, replaces this entry
 * instead of adding a second one. A valid ULID, so it is a legal id.
 */
export const MIGRATED_PROJECT_ID: Id = "00000000KERF0M45PRJ0000000";

/**
 * What happened to the stored project, and what to tell the user (`problem`, in shop words):
 * - "none": nothing to move, or a damaged project or one from a newer Kerf, set aside;
 * - "moved": the library has it and storage no longer does; `problem` says when an older Kerf tab's
 *   later change was kept as a project of its own;
 * - "unreadable": the browser would not let it be read, so it stays where it was;
 * - "refused": the library would not take it (or could not say whether it already had it), so it
 *   stays where it was; `history` is the project, to open this visit (final review, I1).
 */
export type MigrationResult =
  | { outcome: "none" | "moved"; problem?: string }
  | { outcome: "unreadable"; problem: string }
  | { outcome: "refused"; history: History };

/**
 * Said at start when the library would not take the old project: it is open for the visit, but
 * not kept, so where to find it and how to keep it are said on every screen (final review, I1).
 */
export const LAST_PROJECT_NOT_KEPT =
  "Your last project couldn't be moved in with your projects, so it is open but not kept. Open " +
  'it from Home ("Open now, not kept"), then click the project\'s name and choose "Download ' +
  '.kerf file" to keep it.';

/** The name of the project an older tab changed, kept beside the one already moved. */
const olderTabName = (project: Project): string => `${project.name} (older tab)`;

/**
 * Moves the project in browser storage into `library`, named as the project, created when first
 * saved (`kerf.created`, else `now`) and last changed `now` (outcomes: `MigrationResult`). If the
 * library already has the entry (an earlier run moved it), nothing is written over it, so work done
 * on it since is never lost: storage that differs from it is a later change from an older Kerf tab
 * still open, kept as a project of its own; then storage is let go. A damaged row at the fixed id
 * is written over (ADR 016, known limits). Never throws.
 */
export async function migrateStoredProject(
  storage: AppStorage,
  library: Library,
  now: Date,
): Promise<MigrationResult> {
  const { history, problem } = restoreProject(storage);
  if (!history) {
    if (storage.couldNotRead("kerf.project") && problem !== undefined) {
      return { outcome: "unreadable", problem };
    }
    return problem === undefined ? { outcome: "none" } : { outcome: "none", problem };
  }
  const project = currentProject(history);
  const moved = await library.read(MIGRATED_PROJECT_ID);
  if (moved) {
    if (moved.project === serializeProject(project)) return letGo(storage);
    return keepOlderTab(storage, library, history, now);
  }
  // Nothing readable is there; a library that cannot say whether anything is must not be written.
  if ((await library.holds(MIGRATED_PROJECT_ID)) === undefined)
    return { outcome: "refused", history };
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
  return kept ? letGo(storage) : { outcome: "refused", history };
}

/** Removes the stored project, which the library now has. */
function letGo(storage: AppStorage, problem?: string): MigrationResult {
  storage.remove("kerf.project");
  return problem === undefined ? { outcome: "moved" } : { outcome: "moved", problem };
}

/**
 * Keeps the stored project, a later change from an older Kerf tab, as a new project named for it,
 * unless a run that could not let storage go already did; then lets storage go. A library that
 * will not take it, or cannot be listed, leaves it in storage.
 */
async function keepOlderTab(
  storage: AppStorage,
  library: Library,
  history: History,
  now: Date,
): Promise<MigrationResult> {
  const project = currentProject(history);
  const name = olderTabName(project);
  const text = serializeProject({ ...project, name });
  const kept = await library.list();
  if (!kept) return { outcome: "refused", history };
  for (const summary of kept) {
    if ((await library.read(summary.id))?.project === text) return letGo(storage);
  }
  const time = now.toISOString();
  const written = await library.write({
    id: newId(now.getTime()),
    name,
    project: text,
    thumbnail: null,
    created: time,
    modified: time,
    note: "",
  });
  if (!written) return { outcome: "refused", history };
  return letGo(
    storage,
    `Changes made in an older Kerf tab were kept as a project of their own, "${name}".`,
  );
}
