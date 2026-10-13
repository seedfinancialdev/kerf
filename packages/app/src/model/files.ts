// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Saving and opening .kerf files (Domain model, ".kerf file"). The engine and @kerf/io do the
// checking; this module turns their errors into one plain sentence and never throws for bad bytes.

import { CURRENT_SCHEMA_VERSION, type Project, ProjectFormatError } from "@kerf/core";
import { KerfFormatError, readKerf, writeKerf } from "@kerf/io";

/** The app version written into meta.json; bump it with each release. */
export const APP_VERSION = "0.4.0";

/** Writes `project` as a .kerf file with `times` in its meta.json and the thumbnail PNG, if any. */
export function saveKerfBytes(
  project: Project,
  times: { created: string; modified: string },
  thumbnail?: Uint8Array,
): Uint8Array {
  return writeKerf(
    project,
    { schemaVersion: CURRENT_SCHEMA_VERSION, appVersion: APP_VERSION, ...times },
    thumbnail,
  );
}

/** Reads a .kerf file. A damaged or newer file gives a plain message instead of a project. */
export function openKerfBytes(
  bytes: Uint8Array,
): { ok: true; project: Project } | { ok: false; message: string } {
  try {
    return { ok: true, project: readKerf(bytes).project };
  } catch (error) {
    if (error instanceof KerfFormatError || error instanceof ProjectFormatError) {
      return { ok: false, message: `This file could not be opened: ${error.message}` };
    }
    throw error;
  }
}

/** A file name from the project name, with characters file systems reject replaced. */
export function fileNameFor(project: Project): string {
  const base = project.name
    .trim()
    .replace(/\s*["\\/:*?<>|]+\s*/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "Untitled"}.kerf`;
}
