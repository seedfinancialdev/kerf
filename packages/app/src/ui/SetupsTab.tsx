// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Machining by setup (Interaction spec, "6. The build plan", item 4).

import { setupText } from "../model/plan-text";
import { shownProject } from "../model/store";
import { useKerf } from "../state/useKerf";
import { NothingToShow } from "./NothingToShow";

export function SetupsTab() {
  const units = useKerf((s) => shownProject(s)?.units ?? "imperial");
  const setups = useKerf((s) => s.solved?.result.setups);
  if (!setups) return null;
  if (setups.length === 0) return <NothingToShow />;
  return (
    <ol className="plan-list">
      {setups.map((setup) => (
        <li key={setup.setup} data-testid="setup" className={setup.missing ? "missing" : undefined}>
          <span>{setupText(setup, units)}</span>{" "}
          <span className="muted">
            {setup.parts.map((p) => `${p.name} (${p.cuts})`).join(", ")}
          </span>
        </li>
      ))}
    </ol>
  );
}
