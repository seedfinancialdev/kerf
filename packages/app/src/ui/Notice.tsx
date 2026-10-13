// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A short message about what just happened (Interaction spec, "Tweak": "with a notice ... and full
// undo"), or about something the app could not do (ADR 015, rule 11).

import { useKerf } from "../state/useKerf";

export function Notice() {
  const notice = useKerf((s) => s.notice);
  const undo = useKerf((s) => s.undo);
  const dismiss = useKerf((s) => s.dismissNotice);
  return (
    <div role="status" className="notice">
      {notice && (
        <>
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" onClick={undo}>
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
