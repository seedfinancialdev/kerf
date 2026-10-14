// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Sheet layouts (Cut list & nesting, "Outputs"): each sheet drawn to scale with its parts named.

import { stockName } from "../model/plan-text";
import { shownProject } from "../model/store";
import { useKerf } from "../state/useKerf";
import { NothingToShow } from "./NothingToShow";

/** Each drawing's width in its own units; the page sets its size (--sheet-diagram-width). */
const DIAGRAM_WIDTH = 240;

/** Every sheet's layout, numbered, with its stock, and its parts drawn to scale and named. */
export function SheetsTab() {
  const project = useKerf((s) => shownProject(s));
  const sheets = useKerf((s) => s.solved?.result.nesting.sheets);
  if (!project || !sheets) return null;
  if (sheets.length === 0) return <NothingToShow empty="No sheet goods to lay out." />;
  return (
    <ol className="sheets">
      {sheets.map((sheet, i) => {
        // Drawing sizes are display-only floats computed from the engine's integers; never fed
        // back.
        const scale = DIAGRAM_WIDTH / sheet.sheet.length;
        const height = sheet.sheet.width * scale;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: sheets are numbered by position in the plan.
          <li key={i} data-testid="sheet" className="sheet">
            <p className="sheet-title">
              Sheet {i + 1} of {sheets.length} · {stockName(project, sheet.stock)}
            </p>
            <svg
              role="img"
              aria-label={`Parts on this sheet: ${sheet.placements.map((p) => p.name).join(", ")}`}
              viewBox={`0 0 ${DIAGRAM_WIDTH} ${height}`}
              className="sheet-drawing"
            >
              <rect width={DIAGRAM_WIDTH} height={height} className="sheet-board" />
              {sheet.placements.map((p) => (
                <g key={p.instance}>
                  <rect
                    x={p.x * scale}
                    y={p.y * scale}
                    width={p.length * scale}
                    height={p.width * scale}
                    className="sheet-part"
                  />
                  <text
                    x={(p.x + p.length / 2) * scale}
                    y={(p.y + p.width / 2) * scale}
                    className="sheet-label"
                  >
                    {p.name}
                  </text>
                </g>
              ))}
            </svg>
          </li>
        );
      })}
    </ol>
  );
}
