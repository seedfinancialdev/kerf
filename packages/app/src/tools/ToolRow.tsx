// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The tool row under the model: each tool's name and key ("Icons always carry text labels").

import { useKerf } from "../ui/useKerf";
import { Measurements } from "./Measurements";
import { TOOLS } from "./tools";

export function ToolRow() {
  const tool = useKerf((s) => s.tool);
  const setTool = useKerf((s) => s.setTool);
  return (
    <div className="tool-row">
      <div role="toolbar" aria-label="Tools" className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === tool}
            onClick={() => setTool(t.id)}
          >
            {t.label} <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <Measurements />
    </div>
  );
}
