// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What kind of piece a kept project is (design spec §2, "Recent files"), so a card with no picture
// of its model yet can show the drawing of its kind instead.

import { type Project, ProjectFormatError, parseProject } from "@kerf/core";

/** The kinds of piece Home draws; `blank` is a project with no form, or one that cannot be read. */
export type PieceKind = "bookcase" | "cabinet" | "box" | "blank";

/** The kind of `project`, from its first form: a case divided into shelves is a bookcase. */
function kindOf(project: Project): PieceKind {
  const form = project.structures[0];
  if (!form) return "blank";
  if (form.type === "box") return "box";
  return form.openings[0]?.division?.type === "shelves" ? "bookcase" : "cabinet";
}

/**
 * The kind of piece the kept project text `projectText` (as `serializeProject` writes it) is.
 * Text the engine refuses is `blank`: a card is no place to say a project is damaged, and opening
 * it says so. Throws only for a fault in Kerf, never for the text.
 */
export function pieceKindOf(projectText: string): PieceKind {
  try {
    return kindOf(parseProject(projectText));
  } catch (error) {
    if (error instanceof ProjectFormatError) return "blank";
    throw error;
  }
}
