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
}

/** The notice on screen and the warnings still to show, oldest first. */
export interface NoticeLine {
  notice: Notice | null;
  waiting: readonly string[];
}

/** A line showing the first of `warnings` with the rest waiting, or an empty line. */
export function warningsFirst(warnings: readonly string[]): NoticeLine {
  const [first, ...rest] = warnings;
  return first === undefined
    ? { notice: null, waiting: [] }
    : { notice: { text: first, kind: "warning" }, waiting: rest };
}

/**
 * Shows an answer or an Undo offer at once. A warning on screen is not lost: it goes back to the
 * front of the queue and shows again when this notice goes.
 */
export function tell(line: NoticeLine, notice: Notice): NoticeLine {
  const covered = line.notice?.kind === "warning" ? [line.notice.text] : [];
  return { notice, waiting: [...covered, ...line.waiting] };
}

/**
 * Adds a warning: shown now when the line is empty or offers only an Undo (which is also in
 * History), otherwise queued. A warning already shown or waiting is not added twice.
 */
export function warn(line: NoticeLine, text: string): NoticeLine {
  if (line.notice?.text === text || line.waiting.includes(text)) return line;
  const waiting = [...line.waiting, text];
  if (line.notice === null || line.notice.kind === "undo") return warningsFirst(waiting);
  return { notice: line.notice, waiting };
}

/** Takes the notice away and shows the next waiting warning. */
export function dismiss(line: NoticeLine): NoticeLine {
  return warningsFirst(line.waiting);
}

/**
 * The line once History has moved: an Undo offer describes a change that is no longer the latest,
 * so it goes (ruling R13) and the next waiting warning shows; anything else stays.
 */
export function afterHistoryMoved(line: NoticeLine): NoticeLine {
  return line.notice?.kind === "undo" ? dismiss(line) : line;
}
