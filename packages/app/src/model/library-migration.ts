// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Older Kerf kept one project in browser storage (`kerf.project`). It moves into the library once
// (ADR 016, D5) and is removed from storage only after the library has it: a project the library
// cannot keep, or the browser would not let be read, stays where it is.

import { serializeProject } from "@kerf/core";
import { currentProject } from "./history";
import { newId } from "./ids";
import type { Library } from "./library";
import { restoreProject } from "./persist";
import type { AppStorage } from "./storage";

/**
 * Moves the project in browser storage into `library`, named as the project, created when first
 * saved (`kerf.created`, else `now`) and last changed `now`. Returns "moved" once the library has it
 * and storage no longer does; "kept" when it stays in storage (the library refused it, or the
 * browser would not let it be read); "none" when there was nothing to move, including a damaged
 * project, which `restoreProject` sets aside. Never throws.
 */
export async function migrateStoredProject(
  storage: AppStorage,
  library: Library,
  now: Date,
): Promise<"none" | "moved" | "kept"> {
  const { history } = restoreProject(storage);
  if (!history) return storage.couldNotRead("kerf.project") ? "kept" : "none";
  const project = currentProject(history);
  const time = now.toISOString();
  const kept = await library.write({
    id: newId(now.getTime()),
    name: project.name,
    project: serializeProject(project),
    thumbnail: null,
    created: storage.read("kerf.created") ?? time,
    modified: time,
    note: "",
  });
  if (!kept) return "kept";
  storage.remove("kerf.project");
  return "moved";
}
