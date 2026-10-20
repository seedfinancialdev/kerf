// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What kind of piece a kept project is (design spec §2, "Recent files"), so a card with no picture
// of its model yet can show the drawing of its kind instead.

import { type Id, type Project, ProjectFormatError, parseProject } from "@kerf/core";

/** The kinds of piece Home draws; `blank` is a project with no form, or one that cannot be read. */
export type PieceKind = "bookcase" | "cabinet" | "box" | "blank";

/** The kind of `project`, from its first form: a case divided into shelves is a bookcase. */
export function kindOf(project: Project): PieceKind {
  const form = project.structures[0];
  if (!form) return "blank";
  if (form.type === "box") return "box";
  return form.openings[0]?.division?.type === "shelves" ? "bookcase" : "cabinet";
}

/** What a kind is read from: a kept project's id, when it last changed, and its text. */
export interface KeptText {
  id: Id;
  modified: string;
  project: string;
}

/** The kind of `kept`, or `blank` when it cannot be read; a fault in Kerf is logged, not thrown. */
function readKind(kept: KeptText, parse: (text: string) => Project): PieceKind {
  try {
    return kindOf(parse(kept.project));
  } catch (error) {
    // The engine refusing the text is the project's problem, and opening it says so; anything
    // else is a fault in Kerf, logged for a bug report, but never allowed to empty Home.
    if (!(error instanceof ProjectFormatError)) console.error(error);
    return "blank";
  }
}

/**
 * A reader of piece kinds for a library (ADR 016, D5: derived, never kept). Each call takes every
 * kept project and gives each id's kind, reading only projects new or changed since the last call
 * (by `modified`) and forgetting projects no longer listed. `parse` reads project text; the
 * engine's `parseProject` unless given. Never throws.
 */
export function pieceKinds(
  parse: (text: string) => Project = parseProject,
): (kept: readonly KeptText[]) => Map<Id, PieceKind> {
  let known = new Map<Id, { modified: string; kind: PieceKind }>();
  return (kept) => {
    const next = new Map<Id, { modified: string; kind: PieceKind }>();
    for (const k of kept) {
      const before = known.get(k.id);
      const kind = before?.modified === k.modified ? before.kind : readKind(k, parse);
      next.set(k.id, { modified: k.modified, kind });
    }
    known = next;
    return new Map([...next].map(([id, { kind }]) => [id, kind]));
  };
}
