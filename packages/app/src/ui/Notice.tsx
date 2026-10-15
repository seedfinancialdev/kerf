// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A short message about what just happened (Interaction spec, "Tweak": "with a notice ... and full
// undo"), or about something the app could not do (ADR 015, rule 11).

import { useKerf } from "../state/useKerf";

/**
 * The notice line: what just happened or could not be done, with Undo when it can be taken back,
 * and Dismiss.
 */
export function Notice() {
  const notice = useKerf((s) => s.notice);
  const undo = useKerf((s) => s.undo);
  const dismiss = useKerf((s) => s.dismissNotice);
  return (
    <div role="status" className="notice">
      {notice && (
        <>
          <span>{notice.text}</span>
          {notice.kind === "undo" && (
            // A deleted project is put back by the notice's own Undo; a change, by History's.
            <button type="button" onClick={notice.undo ? () => void notice.undo?.() : undo}>
              Undo this
            </button>
          )}
          <button type="button" onClick={dismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Moves the keyboard to the notice line's first button (Undo, when it offers one), for an action
 * whose own control has gone; does nothing when the line shows no button.
 */
export function focusNotice(): void {
  document.querySelector<HTMLElement>(".notice button")?.focus();
}
