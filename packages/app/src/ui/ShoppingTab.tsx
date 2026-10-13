// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The shopping list (Interaction spec, "6. The build plan", item 1): what to buy per stock. "Net of
// what's on hand" needs an inventory the project does not have yet (ADR 013, "Not done").

import { totalsText } from "../model/plan-text";
import { shownProject } from "../model/store";
import { useKerf } from "../state/useKerf";
import { NothingToShow } from "./NothingToShow";

/** What to buy, per stock. */
export function ShoppingTab() {
  const project = useKerf((s) => shownProject(s));
  const totals = useKerf((s) => s.solved?.result.nesting.totals);
  if (!project || !totals) return null;
  if (totals.length === 0) return <NothingToShow empty="Nothing to buy yet." />;
  return (
    <ul className="plan-list">
      {totals.map((t) => (
        <li key={t.stock}>{totalsText(t, project)}</li>
      ))}
    </ul>
  );
}
