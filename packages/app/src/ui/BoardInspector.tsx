// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The selected boards (Interaction spec, "Inspector": "a part's properties ('Length 34-9/16" · cut
// 35-1/16"')"), where they came from, and their problems. Shown as a list of facts, not fields.

import {
  formatLength,
  generateStructures,
  type Id,
  type PlacedPart,
  type Project,
  type SolveResult,
} from "@kerf/core";
import { useMemo } from "react";
import { handBack } from "../model/commands";
import { shownProject } from "../model/store";
import { Problems } from "./Problems";
import { Section } from "./Section";
import { useKerf, useKerfStore } from "./useKerf";

/** `34-9/16" · cut 35-1/16"` when the cut differs from the visible size (Domain model, decision 3). */
function sized(visible: number, cut: number | undefined, units: Project["units"]): string {
  const v = formatLength(visible, units);
  return cut === undefined || cut === visible ? v : `${v} · cut ${formatLength(cut, units)}`;
}

function cutLineOf(result: SolveResult, boardName: string) {
  return result.cutList.lines.find((l) => l.parts.some((p) => p.name === boardName));
}

function originOf(placed: PlacedPart): string {
  if (!placed.source) return "Made by hand.";
  return placed.detached
    ? "Custom: the form won't change it."
    : "Made by the form. Editing one by hand takes it over.";
}

/** The facts about the picked boards, their problems, and a way to hand a taken-over one back. */
export function BoardInspector({ instances }: { instances: Id[] }) {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const shop = useKerf((s) => s.shop);
  // The saved project holds no generated boards, so their definitions come from the form.
  const withForms = useMemo(() => project && generateStructures(project, shop), [project, shop]);
  if (!project || !result || !withForms) return null;
  const placed = result.placements.filter((p) => instances.includes(p.instance));
  const first = placed[0];
  if (!first) return <p className="empty">The selected boards are no longer in the project.</p>;
  // Placed copies are named "Shelf 1".."Shelf 4"; the board they share is "Shelf".
  const definition = withForms.parts.find((d) => d.id === first.part);
  const boardName = definition?.name ?? first.name;
  const sameBoard = placed.every((p) => p.part === first.part);
  const title = sameBoard
    ? `${boardName}${placed.length > 1 ? ` × ${placed.length}` : ""}`
    : `${placed.length} boards`;
  const line = cutLineOf(result, boardName);
  const stock = withForms.stock.find((s) => s.id === definition?.stock);
  return (
    <div className="step-panel">
      <h2 className="board-title">{title}</h2>
      <Section title="Board">
        <dl className="facts">
          <dt>Length</dt>
          <dd>{sized(line?.visible.length ?? first.size.length, line?.length, project.units)}</dd>
          <dt>Width</dt>
          <dd>{sized(line?.visible.width ?? first.size.width, line?.width, project.units)}</dd>
          <dt>Thickness</dt>
          <dd>{formatLength(first.size.thickness, project.units)}</dd>
          {stock && (
            <>
              <dt>Stock</dt>
              <dd>{stock.name}</dd>
            </>
          )}
        </dl>
        <p className="origin">{originOf(first)}</p>
        {first.detached && placed.length === 1 && (
          <button
            type="button"
            onClick={() => store.getState().apply(handBack(project, first, shop))}
          >
            Follow the form again
          </button>
        )}
      </Section>
      <Problems parts={new Set(placed.map((p) => p.part))} />
    </div>
  );
}
