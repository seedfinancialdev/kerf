// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The one notice line and the warnings waiting behind it (Interaction spec, "Tweak": "with a notice
// ... and full undo"; ADR 015, rule 11: "the app says so once"). There is one line, so a warning
// the user must read (work not kept, a project set aside, the 3D view not starting) waits its turn
// instead of being replaced; an answer to the last action or an Undo offer shows at once.

/**
 * What the notice line shows. `undo` describes one change and offers Undo for it; `said` answers
 * the user's last action (a refusal, a file that could not be opened); `warning` is something the
 * user must not miss, kept until dismissed.
 */
export interface Notice {
  text: string;
  kind: "undo" | "said" | "warning";
  /**
   * Takes back a change that is not a History step (a project deleted on Home, design spec §2);
   * absent, Undo steps History back.
   */
  undo?: () => Promise<void>;
}

/**
 * The notice on screen, the warnings still to show, oldest first, and the Undo offer an answer
 * covered (`held`), shown again when that answer goes.
 */
export interface NoticeLine {
  notice: Notice | null;
  waiting: readonly string[];
  held: Notice | null;
}

/** A line showing the first of `warnings` with the rest waiting, or an empty line. */
export function warningsFirst(warnings: readonly string[]): NoticeLine {
  const [first, ...rest] = warnings;
  return first === undefined
    ? { notice: null, waiting: [], held: null }
    : { notice: { text: first, kind: "warning" }, waiting: rest, held: null };
}

/**
 * Shows an answer or an Undo offer at once. A warning on screen is not lost: it goes back to the
 * front of the queue and shows again when this notice goes. An Undo offer an answer covers is held
 * and shows again when the answer goes, since it may be the only words naming a problem the change
 * brought; a new Undo offer replaces it.
 */
export function tell(line: NoticeLine, notice: Notice): NoticeLine {
  const covered = line.notice?.kind === "warning" ? [line.notice.text] : [];
  const waiting = [...covered, ...line.waiting];
  if (notice.kind !== "said") return { notice, waiting, held: null };
  const held = line.notice?.kind === "undo" ? line.notice : line.held;
  return { notice, waiting, held };
}

/**
 * Adds a warning: shown now when the line is empty, otherwise queued behind what is shown. An
 * Undo offer is not replaced either: it may be the only words naming a problem the change brought
 * (ADR 015, rule 13). A warning already shown or waiting is not added twice.
 */
export function warn(line: NoticeLine, text: string): NoticeLine {
  if (line.notice?.text === text || line.waiting.includes(text)) return line;
  const waiting = [...line.waiting, text];
  return line.notice === null
    ? { ...warningsFirst(waiting), held: line.held }
    : { notice: line.notice, waiting, held: line.held };
}

/** Takes the notice away and shows the held Undo offer, if any, else the next waiting warning. */
export function dismiss(line: NoticeLine): NoticeLine {
  if (line.held) return { notice: line.held, waiting: line.waiting, held: null };
  return warningsFirst(line.waiting);
}

/**
 * The line once History has moved: an Undo offer for a History step describes a change that is no
 * longer the latest, so it goes (ADR 015, ruling A), held or shown, and the next waiting warning
 * shows; anything else stays. An offer with its own `undo` (a deleted project) is not a History
 * step, so it stays.
 */
export function afterHistoryMoved(line: NoticeLine): NoticeLine {
  const stale = (notice: Notice | null): boolean => notice?.kind === "undo" && !notice.undo;
  const unheld = { ...line, held: stale(line.held) ? null : line.held };
  return stale(line.notice) ? dismiss(unheld) : unheld;
}
