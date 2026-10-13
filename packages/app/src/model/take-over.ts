// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Boards the form makes, and the one notice every tool gives when it takes one over (Interaction
// spec, "Tweak": "Editing a board that a form generated detaches only that board, with a notice
// ('Shelf 3 is now custom; the form won't change it')"). One wording for Push/Pull, Move, Join and
// Edge, so a board is named the same way whichever tool took it (code review I4).

import type { PlacedPart, Project } from "@kerf/core";
import { instanceOf } from "./commands";
import type { TakenOver } from "./pending";

/** True for a board the form still makes; editing it by hand takes it over first. */
export function followsForm(placed: PlacedPart): boolean {
  return placed.source !== undefined && !placed.detached;
}

/**
 * The boards the form made in `before` (one solve's placements) that an edit took over, giving
 * `after`, with their names before and after. A board taken over is saved in `after`; one the form
 * still makes is not. This catches every board taken over, not only the one clicked: the two sides
 * share one part, so taking one over takes both. A copy taken out of a row is renamed by the engine
 * ("Shelf 2" becomes "Shelf copy 2").
 */
export function takenOver(before: readonly PlacedPart[], after: Project): TakenOver[] {
  return before.filter(followsForm).flatMap((b) => {
    const saved = instanceOf(after, b);
    return saved ? [{ from: b.name, to: saved.name ?? b.name }] : [];
  });
}

/** The boards by name, a changed name beside the old one: "Shelf 1 (now Shelf copy 1) and Back". */
export function namesTaken(taken: readonly TakenOver[]): string {
  const names = taken.map((t) => (t.from === t.to ? t.from : `${t.from} (now ${t.to})`));
  const last = names.pop();
  return names.length === 0 ? (last ?? "") : `${names.join(", ")} and ${last}`;
}

/**
 * The sentence that tells the user which boards were taken over and that the form will leave them
 * alone; a board whose name changed (a copy taken out of a row) shows both names. Undefined when
 * no board was taken over.
 */
export function takeOverNotice(taken: readonly TakenOver[]): string | undefined {
  const [first, second] = taken;
  if (!first) return undefined;
  if (!second) {
    return first.from === first.to
      ? `${first.from} is now custom; the form won't change it.`
      : `${first.from} becomes ${first.to}, custom; the form won't change it.`;
  }
  return `${namesTaken(taken)} are now custom; the form won't change them.`;
}
