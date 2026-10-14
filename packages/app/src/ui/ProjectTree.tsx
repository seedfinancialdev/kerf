// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The project tree (Interaction spec, "Project tree (left)"). Rows are tree items, not buttons
// (design spec, end-to-end contract), and keyboard users move with the arrow keys and Enter.

import type { KeyboardEvent } from "react";
import { shownProject } from "../model/store";
import { type TreeRow, treeRows } from "../model/tree";
import { useKerf, useKerfStore } from "../state/useKerf";

/** The project tree: forms, openings and boards. */
export function ProjectTree() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const selection = useKerf((s) => s.selection);
  if (!project || !result) return <p className="empty">No project yet. Click New in Start.</p>;
  const rows = treeRows(project, result);

  const pick = (row: TreeRow): void => {
    const s = store.getState();
    if (row.kind === "structure") s.select({ kind: "structure", structure: row.structure });
    if (row.kind === "opening")
      s.select({ kind: "opening", structure: row.structure, opening: row.opening });
    if (row.kind === "group") s.select({ kind: "boards", instances: row.instances });
  };
  const isSelected = (row: TreeRow): boolean =>
    (row.kind === "structure" &&
      selection.kind === "structure" &&
      selection.structure === row.structure) ||
    (row.kind === "opening" && selection.kind === "opening" && selection.opening === row.opening) ||
    (row.kind === "group" &&
      selection.kind === "boards" &&
      row.instances.every((i) => selection.instances.includes(i)));
  const onKey = (e: KeyboardEvent<HTMLElement>, row: TreeRow): void => {
    if (e.key === "Enter" || e.key === " ") {
      // Space would also scroll the panel; the row is what was meant.
      e.preventDefault();
      pick(row);
    }
    if (e.key === "ArrowDown") (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    if (e.key === "ArrowUp")
      (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
  };

  return (
    <div role="tree" aria-label="Boards and openings" className="tree">
      {rows.map((row) => (
        <div
          key={row.key}
          role="treeitem"
          tabIndex={0}
          aria-selected={isSelected(row)}
          aria-level={row.depth + 1}
          data-testid={
            row.kind === "opening" ? "opening" : row.kind === "group" ? row.testId : undefined
          }
          className="tree-row"
          style={{ paddingLeft: `calc(var(--space-3) + ${row.depth} * var(--space-4))` }}
          onClick={() => pick(row)}
          onKeyDown={(e) => onKey(e, row)}
        >
          <span className="tree-label">{row.label}</span>
          {row.kind === "group" && <span className="tree-count">{row.count}</span>}
          {row.problems > 0 && <span className="badge">{row.problems}</span>}
        </div>
      ))}
    </div>
  );
}
