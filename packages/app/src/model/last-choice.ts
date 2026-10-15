// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The last New project choice (design spec §3: "Remembers the last piece, wood and units"), kept in
// browser storage so the panel opens where the user left it. Only the piece and wood are kept here:
// the units are the units for new projects (kerf.units), which Settings sets too, so both agree.

import { BLANKS, type NewProjectChoice, PIECES } from "./new-project";
import type { AppStorage } from "./storage";

/** What is remembered of a New project choice here. */
export type LastChoice = Pick<NewProjectChoice, "piece" | "wood">;

const KEY = "kerf.lastChoice";

/** Pieces that can be started today; one marked Later is never remembered as chosen. */
const STARTABLE = new Set<string>([...PIECES, ...BLANKS].filter((p) => !p.later).map((p) => p.id));

/**
 * The last choice kept in `storage`, with each part that is still good: a piece that can be
 * started, and a wood id (whether the shop still stocks it is the panel's to check). Nothing
 * kept, damaged text, or storage that cannot be read gives `{}`; it never throws.
 */
export function readLastChoice(storage: AppStorage): Partial<LastChoice> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.read(KEY) ?? "{}");
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const { piece, wood } = parsed as Record<string, unknown>;
  return {
    ...(typeof piece === "string" && STARTABLE.has(piece)
      ? { piece: piece as LastChoice["piece"] }
      : {}),
    ...(typeof wood === "string" && wood !== "" ? { wood } : {}),
  };
}

/** Keeps `choice`'s piece and wood in `storage`; false when the browser would not keep it. */
export function writeLastChoice(storage: AppStorage, choice: LastChoice): boolean {
  const { piece, wood } = choice;
  return storage.write(KEY, JSON.stringify({ piece, wood }));
}
