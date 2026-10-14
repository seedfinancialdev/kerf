// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The History list (Interaction spec, "History panel"): every change in shop words; click an entry
// to step back to it. Entries are list options, not buttons, so no entry's words ("New bookcase")
// can be mistaken for a command.

import { useKerf } from "../state/useKerf";

/** Every change, newest last, with the shown one marked. */
export function HistoryPanel() {
  const history = useKerf((s) => s.history);
  const jumpTo = useKerf((s) => s.jumpTo);
  if (!history) return null;
  return (
    <div className="history">
      <h2 className="panel-heading">History</h2>
      <div role="listbox" aria-label="History" className="history-list">
        {history.entries.map((entry, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: entries have no id; position is their identity in History.
            key={index}
            role="option"
            tabIndex={0}
            aria-selected={index === history.at}
            className={index > history.at ? "history-entry undone" : "history-entry"}
            onClick={() => jumpTo(index)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              // Space would also scroll the list; the entry is what was meant.
              e.preventDefault();
              jumpTo(index);
            }}
          >
            {entry.label}
          </div>
        ))}
      </div>
    </div>
  );
}
