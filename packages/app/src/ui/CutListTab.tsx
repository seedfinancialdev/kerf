// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The cut list (Cut list & nesting): one line per identical cut size, with the visible size beside
// the cut size (Domain model, decision 3). Every cut is planned with the saw's blade width, so a shop
// with no saw on its wall, never told about one, is asked what it cuts with (ADR 016, D4).

import { cutLineText } from "../model/plan-text";
import { toldAbout } from "../model/shop-record";
import { shownProject } from "../model/store";
import { useKerf } from "../state/useKerf";
import { AskAboutTool } from "./AskAboutTool";
import { NothingToShow } from "./NothingToShow";

/** The cut list as a table. */
export function CutListTab() {
  const project = useKerf((s) => shownProject(s));
  const lines = useKerf((s) => s.solved?.result.cutList.lines);
  const askSaw = useKerf(
    (s) => !s.shopRecord.tableSaw && !s.shopRecord.trackSaw && !toldAbout(s.shopRecord, "saw"),
  );
  if (!project || !lines) return null;
  if (lines.length === 0) return <NothingToShow empty="No boards to cut yet." />;
  return (
    <>
      {askSaw && <AskAboutTool topic="saw" />}
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
    </>
  );
}
