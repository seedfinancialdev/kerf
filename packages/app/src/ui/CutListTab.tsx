// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The cut list (Cut list & nesting): one line per identical cut size, with the visible size beside
// the cut size (Domain model, decision 3).

import { cutLineText } from "../model/plan-text";
import { shownProject } from "../model/store";
import { useKerf } from "./useKerf";

export function CutListTab() {
  const project = useKerf((s) => shownProject(s));
  const lines = useKerf((s) => s.solved?.result.cutList.lines);
  if (!project || !lines) return null;
  return (
    <table className="plan-table">
      <thead>
        <tr>
          <th scope="col">Parts</th>
          <th scope="col">Qty</th>
          <th scope="col">Stock</th>
          <th scope="col">Cut</th>
          <th scope="col">Visible</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const t = cutLineText(line, project);
          return (
            <tr
              key={`${line.stock}:${line.length}:${line.width}:${line.thickness}`}
              data-testid="cutlist-line"
            >
              <td>{t.parts}</td>
              <td>{line.quantity}</td>
              <td>{t.stock}</td>
              <td className="num">{t.cut}</td>
              <td className="num muted">{t.visible}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
