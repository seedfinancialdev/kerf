// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The selected boards (Interaction spec, "Inspector": "a part's properties ('Length 34-9/16" · cut
// 35-1/16"')"), where they came from, and their problems. Shown as a list of facts, not fields.

import { formatLength, type Id, type PlacedPart, type Project, type SolveResult } from "@kerf/core";
import { handBack } from "../model/commands";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { undrawnBoards } from "../viewport/meshes";
import { BOARD_NOT_DRAWN, ThreeDGuard } from "../viewport/ThreeDGuard";
import { useGeometry } from "../viewport/useGeometry";
import { EdgePanel } from "./EdgePanel";
import { Problems } from "./Problems";
import { Section } from "./Section";

/**
 * `34-9/16" · cut 35-1/16"` when the cut differs from the visible size (Domain model, decision 3).
 */
function sized(visible: number, cut: number, units: Project["units"]): string {
  const v = formatLength(visible, units);
  return cut === visible ? v : `${v} · cut ${formatLength(cut, units)}`;
}

function originOf(placed: PlacedPart[]): string {
  const madeBy = (p: PlacedPart) => (p.source ? (p.detached ? "custom" : "form") : "hand");
  if (new Set(placed.map(madeBy)).size > 1) return "Some made by the form, some by hand.";
  const [first] = placed;
  if (first && !first.source) return "Made by hand.";
  return first?.detached
    ? "Custom: the form won't change it."
    : "Made by the form. Editing one by hand takes it over.";
}

/** "Top, Shelf × 4" for a pick of different boards. */
function listOf(placed: PlacedPart[]): string {
  const counts = new Map<string, number>();
  for (const p of placed) counts.set(p.partName, (counts.get(p.partName) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} × ${n}` : name)).join(", ");
}

/**
 * Why the 3D view draws each picked board as a plain blank, when it does (ADR 015, rule 10). It
 * asks the geometry engine, so it is drawn inside ThreeDGuard: an engine failure must not take the
 * inspector with it.
 */
function UndrawnNotes({ placed, result }: { placed: PlacedPart[]; result: SolveResult }) {
  const { ready } = useGeometry();
  if (!ready) return null;
  const undrawn = undrawnBoards(result);
  return placed.flatMap((p) => {
    const reason = undrawn.get(p.instance);
    return reason === undefined
      ? []
      : [
          <p key={p.instance} className="problem warning">
            The 3D view shows {p.name} without its cuts: {reason}
          </p>,
        ];
  });
}

/** The facts about the picked boards, their problems, and a way to hand a taken-over one back. */
export function BoardInspector({ instances }: { instances: Id[] }) {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const shop = useKerf((s) => s.shop);
  const tool = useKerf((s) => s.tool);
  if (!project || !result) return null;
  const placed = result.placements.filter((p) => instances.includes(p.instance));
  const first = placed[0];
  if (!first) return <p className="empty">The selected boards are no longer in the project.</p>;
  // Placed copies are named "Shelf 1".."Shelf 4"; the board they share is "Shelf".
  const sameBoard = placed.every((p) => p.part === first.part);
  const title = sameBoard
    ? `${first.partName}${placed.length > 1 ? ` × ${placed.length}` : ""}`
    : `${placed.length} boards`;
  const stock = project.stock.find((s) => s.id === first.stock);
  const handBackToForm = () => {
    const r = handBack(project, first, shop);
    if (r.ok) store.getState().apply(r.edit);
    else store.getState().say(r.message);
  };
  return (
    <div className="step-panel">
      <h2 className="board-title">{title}</h2>
      {tool === "edge" && <EdgePanel placed={placed} />}
      <Section title="Board">
        {sameBoard ? (
          <dl className="facts">
            <dt>Length</dt>
            <dd>{sized(first.size.length, first.cut.length, project.units)}</dd>
            <dt>Width</dt>
            <dd>{sized(first.size.width, first.cut.width, project.units)}</dd>
            <dt>Thickness</dt>
            <dd>{sized(first.size.thickness, first.cut.thickness, project.units)}</dd>
            {stock && (
              <>
                <dt>Stock</dt>
                <dd>{stock.name}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="origin">{listOf(placed)}</p>
        )}
        <p className="origin">{originOf(placed)}</p>
        {placed.length === 1 && first.detached && (
          <button type="button" onClick={handBackToForm}>
            Follow the form again
          </button>
        )}
      </Section>
      <ThreeDGuard told={BOARD_NOT_DRAWN}>
        <UndrawnNotes placed={placed} result={result} />
      </ThreeDGuard>
      <Problems parts={new Set(placed.map((p) => p.part))} />
    </div>
  );
}
