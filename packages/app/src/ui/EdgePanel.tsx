// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Edge profile panel: a radius from the shop's roundover bits, then both front edges or the
// edges ticked by name.

import { type EdgeRef, edgeName, formatLength, type PlacedPart } from "@kerf/core";
import { useId, useState } from "react";
import { instanceOf } from "../model/commands";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { BOTH_FRONT_EDGES, roundEdges, roundsEveryShelf } from "../tools/edge";
import { editNotice } from "../tools/edit-outcome";
import { Section } from "./Section";

const ALL_EDGES: EdgeRef[] = [
  "edge1/face1",
  "edge1/face0",
  "edge0/face1",
  "edge0/face0",
  "end0/face1",
  "end0/face0",
  "end1/face1",
  "end1/face0",
];

/** Rounds the picked boards' edges with a bit from the shop. */
export function EdgePanel({ placed }: { placed: PlacedPart[] }) {
  const store = useKerfStore();
  const radiusId = useId();
  const shop = useKerf((s) => s.shop);
  // Built here, not in the selector: a selector that returns a new array each call redraws forever.
  const bits = shop.tools.flatMap((t) => (t.type === "router" ? t.roundoverBits : []));
  const units = useKerf((s) => shownProject(s)?.units ?? "imperial");
  // The user's choice: a bit, "none", or not chosen yet. A bit since taken out of the shop is no
  // choice at all, so the shop's first bit is offered instead (Interaction spec: roundovers use
  // "bits from the shop profile").
  const [chosen, setChosen] = useState<number | "none" | null>(null);
  const radius =
    chosen === "none"
      ? null
      : chosen !== null && bits.includes(chosen)
        ? chosen
        : (bits[0] ?? null);
  const [ticked, setTicked] = useState<EdgeRef[]>([]);
  /** Rounds `edges`, telling the user which boards were taken over (Interaction spec, "Tweak"). */
  const round = (edges: EdgeRef[]): void => {
    const s = store.getState();
    const project = shownProject(s);
    if (!project) return;
    const r = roundEdges(project, placed, edges, radius, s.shop);
    if (!r.ok) {
      s.say(r.message);
      return;
    }
    const edited = placed.map((p) => instanceOf(r.edit.project, p)?.id ?? p.instance);
    s.apply(r.edit, editNotice(project, r.edit.project, s.shop, edited));
  };
  return (
    <Section title="Roundover">
      <div className="field">
        <label htmlFor={radiusId}>Radius</label>
        <select
          id={radiusId}
          value={radius ?? ""}
          onChange={(e) => setChosen(e.target.value === "" ? "none" : Number(e.target.value))}
        >
          <option value="">None</option>
          {bits.map((b) => (
            <option key={b} value={b}>
              {formatLength(b, units)}
            </option>
          ))}
        </select>
      </div>
      {bits.length === 0 && (
        <p className="muted">Your shop has no roundover bits. Add them in Start, Your shop.</p>
      )}
      <button type="button" onClick={() => round(BOTH_FRONT_EDGES)}>
        Both front edges
      </button>
      {roundsEveryShelf(placed) && (
        <p className="muted">
          Both front edges rounds every shelf the form makes, so they keep following it.
        </p>
      )}
      <fieldset className="edge-list">
        <legend>Or pick edges</legend>
        {ALL_EDGES.map((edge) => (
          <label key={edge} className="check">
            <input
              type="checkbox"
              checked={ticked.includes(edge)}
              onChange={(e) =>
                setTicked(e.target.checked ? [...ticked, edge] : ticked.filter((x) => x !== edge))
              }
            />
            {edgeName(edge)}
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={ticked.length === 0} onClick={() => round(ticked)}>
        Round the ticked edges
      </button>
    </Section>
  );
}
