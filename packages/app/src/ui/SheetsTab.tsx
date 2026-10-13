// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Sheet layouts (Cut list & nesting, "Outputs"): each sheet drawn to scale with its parts named.

import { shownProject } from "../model/store";
import { useKerf } from "./useKerf";

const WIDTH_PX = 240;

export function SheetsTab() {
  const project = useKerf((s) => shownProject(s));
  const sheets = useKerf((s) => s.solved?.result.nesting.sheets);
  if (!project || !sheets) return null;
  return (
    <ol className="sheets">
      {sheets.map((sheet, i) => {
        // Pixel sizes are display-only floats computed from the engine's integers; never fed back.
        const scale = WIDTH_PX / sheet.sheet.length;
        const name = project.stock.find((st) => st.id === sheet.stock)?.name ?? "";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: sheets are numbered by position in the plan.
          <li key={i} data-testid="sheet" className="sheet">
            <p className="sheet-title">
              Sheet {i + 1} of {sheets.length} · {name}
            </p>
            <svg
              aria-hidden="true"
              width={WIDTH_PX}
              height={sheet.sheet.width * scale}
              className="sheet-drawing"
            >
              <rect width={WIDTH_PX} height={sheet.sheet.width * scale} className="sheet-board" />
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
