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

/**
 * Reads a .kerf file. A damaged or newer file gives a plain message instead of a project. The
 * engine's messages carry file paths ("$.name: ...") that mean nothing in the shop, so only the
 * newer-version one, which is already plain and tells the user what to do, is passed on. @kerf/io
 * has no typed error for it, so it is recognised by its wording.
 */
export function openKerfBytes(
  bytes: Uint8Array,
): { ok: true; project: Project } | { ok: false; message: string } {
  try {
    return { ok: true, project: readKerf(bytes).project };
  } catch (error) {
    if (error instanceof KerfFormatError && /newer version of Kerf/.test(error.message)) {
      return { ok: false, message: `This file could not be opened: ${error.message}` };
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

/** A plain reason a save failed, for "The file could not be saved: <reason>." */
export function saveFailureReason(error: unknown): string {
  if (error instanceof KerfFormatError) return "the picture of the model was not usable.";
  if (error instanceof ProjectFormatError) return "the project's contents do not make sense.";
  return "something went wrong while writing it.";
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
