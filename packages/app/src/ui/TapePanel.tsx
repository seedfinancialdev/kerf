// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Tape reading and guide lines (Interaction spec, "Tape: Measure, add guide lines").

import { formatLength } from "@kerf/core";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { measureBetween } from "../tools/tape";
import { Section } from "./Section";

/** The Tape's reading, and the guide lines it has left. */
export function TapePanel() {
  const store = useKerfStore();
  const tape = useKerf((s) => s.tape);
  const units = useKerf((s) => shownProject(s)?.units ?? "imperial");
  const guides = useKerf((s) => s.guides.length);
  if (!tape) return <p className="empty">Click two points to measure.</p>;
  const r = measureBetween(tape.from, tape.to, units);
  const f = (n: number): string => formatLength(n, units);
  return (
    <Section title="Measured">
      <dl className="facts">
        <dt>Left to right</dt>
        <dd>{f(r.leftRight)}</dd>
        <dt>Front to back</dt>
        <dd>{f(r.frontBack)}</dd>
        <dt>Up and down</dt>
        <dd>{f(r.upDown)}</dd>
        <dt>Straight line</dt>
        <dd>{f(r.straight)}</dd>
      </dl>
      <div className="button-row">
        <button type="button" onClick={() => store.getState().addGuide(tape.from, tape.to)}>
          Keep as a guide line
        </button>
        {guides > 0 && (
          <button type="button" onClick={() => store.getState().clearGuides()}>
            Clear guide lines
          </button>
        )}
      </div>
    </Section>
  );
}
