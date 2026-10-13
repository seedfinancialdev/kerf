// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Saving and opening .kerf files (Domain model, ".kerf file"). The engine and @kerf/io do the
// checking; this module turns their errors into one plain sentence and never throws for bad bytes.

import { CURRENT_SCHEMA_VERSION, type Project, ProjectFormatError } from "@kerf/core";
import { KerfFormatError, readKerf, writeKerf } from "@kerf/io";

/**
 * Why a project the engine rejects could not be opened, in shop words. The engine's own message
 * names a place in the file ("$.instances[0].def: ...") that means nothing in the shop.
 */
export const DAMAGED_CONTENTS = "its contents are damaged or do not make sense";

/**
 * True for the engine's refusal of a project from a newer Kerf (its schema version is past this
 * one's), which only updating Kerf can open: told apart from damage by the field it names.
 */
export function isFromNewerKerf(error: unknown): boolean {
  return error instanceof ProjectFormatError && error.path === "$.schemaVersion";
}

/** Said for a file from a newer Kerf, with what to do. */
const NEWER_FILE = "This file was made by a newer version of Kerf; update Kerf to open it.";

/** The app version written into meta.json; bump it with each release. */
const APP_VERSION = "0.4.0";

/**
 * Writes `project` as a .kerf file with `times` in its meta.json and the thumbnail PNG, if any. A
 * picture @kerf/io refuses (not a PNG, or too large) is left out, and logged, rather than stopping
 * the save: the file is the user's work, the picture only a preview. Throws as `writeKerf` does
 * otherwise.
 */
export function saveKerfBytes(
  project: Project,
  times: { created: string; modified: string },
  thumbnail?: Uint8Array,
): Uint8Array {
  const meta = { schemaVersion: CURRENT_SCHEMA_VERSION, appVersion: APP_VERSION, ...times };
  if (!thumbnail) return writeKerf(project, meta);
  try {
    return writeKerf(project, meta, thumbnail);
  } catch (error) {
    if (!(error instanceof KerfFormatError)) throw error;
    // The view made a picture @kerf/io will not take: a fault in Kerf, logged for a bug report.
    console.error(error);
    return writeKerf(project, meta);
  }
}

/**
 * Reads a .kerf file. A damaged or newer file gives a plain message instead of a project: the
 * engine's messages carry file paths ("$.name: ...") that mean nothing in the shop. A newer file,
 * whether its meta.json or its project says so, is told to update Kerf; @kerf/io has no typed
 * error for it, so its refusal is recognised by its wording.
 */
export function openKerfBytes(
  bytes: Uint8Array,
): { ok: true; project: Project } | { ok: false; message: string } {
  try {
    return { ok: true, project: readKerf(bytes).project };
  } catch (error) {
    if (
      (error instanceof KerfFormatError && /newer version of Kerf/.test(error.message)) ||
      isFromNewerKerf(error)
    ) {
      return { ok: false, message: NEWER_FILE };
    }
    if (error instanceof KerfFormatError) {
      return {
        ok: false,
        message: "This file could not be opened: it is not a Kerf file, or it is damaged.",
      };
    }
    if (error instanceof ProjectFormatError) {
      return {
        ok: false,
        message: `This file could not be opened: ${DAMAGED_CONTENTS}.`,
      };
    }
    throw error;
  }
}

/**
 * A plain reason a save failed, for "The file could not be saved: <reason>.", or undefined when
 * the failure is not in the project or its details but a fault in Kerf, to be logged and reported.
 */
export function saveFailureReason(error: unknown): string | undefined {
  if (error instanceof KerfFormatError) return "its dates or version could not be written.";
  if (error instanceof ProjectFormatError) return "the project's contents do not make sense.";
  return undefined;
}

/** Said when saving fails through a fault in Kerf rather than in the project. */
export const SAVE_FAULT =
  "Kerf hit a problem saving this project, so nothing was saved. Please report it.";

/** Said when opening a file that was read fails through a fault in Kerf rather than in the file. */
export const OPEN_FAULT =
  "Kerf hit a problem opening this file. Please report it; your project is unchanged.";

/** A file name from the project name, with characters file systems reject replaced. */
export function fileNameFor(project: Project): string {
  const base = project.name
    .trim()
    .replace(/\s*["\\/:*?<>|]+\s*/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "Untitled"}.kerf`;
}
