// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Board tool's panel: which stock a new board is cut from (its thickness is the stock's).

import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { boardStockFor } from "../tools/board";
import { Choice } from "./Choice";
import { Section } from "./Section";

/** The stock to draw new boards in; nothing when the project has no stock. */
export function BoardStockPanel() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const chosen = useKerf((s) => s.boardStock);
  const current = project ? boardStockFor(project, chosen) : undefined;
  if (!project || project.stock.length === 0) return null;
  return (
    <Section title="New boards">
      <Choice
        label="Stock"
        value={current ?? ""}
        options={project.stock.map((s) => ({ value: s.id, label: s.name }))}
        onChange={(id) => store.getState().setBoardStock(id)}
      />
    </Section>
  );
}
