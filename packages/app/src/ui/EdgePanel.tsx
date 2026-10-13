// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Edge profile panel: a radius from the shop's roundover bits, then both front edges or the
// edges ticked by name.

import { type EdgeRef, edgeName, formatLength, type PlacedPart } from "@kerf/core";
import { useId, useState } from "react";
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
  const [radius, setRadius] = useState<number | null>(bits[0] ?? null);
  const [ticked, setTicked] = useState<EdgeRef[]>([]);
  /** Rounds `edges`, telling the user which boards were taken over (Interaction spec, "Tweak"). */
  const round = (edges: EdgeRef[]): void => {
    const s = store.getState();
    const project = shownProject(s);
    if (!project) return;
    const r = roundEdges(project, placed, edges, radius, s.shop);
    if (r.ok) s.apply(r.edit, editNotice(project, r.edit.project, s.shop));
    else s.say(r.message);
  };
  return (
    <Section title="Roundover">
      <div className="field">
        <label htmlFor={radiusId}>Radius</label>
        <select
          id={radiusId}
          value={radius ?? ""}
          onChange={(e) => setRadius(e.target.value === "" ? null : Number(e.target.value))}
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
