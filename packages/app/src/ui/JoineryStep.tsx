// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// 4. Joinery (Interaction spec; ADR 015, D2): the joints the form chose, what the shop can cut, and
// Accept all. Where the engine offers another joint (box corners) the choice is here too.

import { acceptJoinery, setOption } from "../model/commands";
import { joineryRows } from "../model/joinery";
import { CHOICES, DEFAULT_CORNER_JOINT } from "../model/labels";
import { shownProject } from "../model/store";
import { asksAbout } from "../model/tool-questions";
import { useKerf, useKerfStore } from "../state/useKerf";
import { AskAboutTool } from "./AskAboutTool";
import { Choice } from "./Choice";
import { Section } from "./Section";

/** The Joinery step's panel. */
export function JoineryStep() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const joints = useKerf((s) => s.solved?.result.joints);
  const shopRecord = useKerf((s) => s.shopRecord);
  // The Workshop shows only with a project open (App.tsx; Ruling R27),
  // so the no-project state renders nothing rather than words nobody can reach.
  if (!project || !joints) return null;
  const rows = joineryRows(joints, project.units);
  // Ask when it matters (ADR 016, D4): a tool the shop was never told about is asked about once, on
  // the first joint that needs it, where the answer then stays; until it is answered no row claims what
  // the shop can or cannot cut.
  const firstOfTool = rows
    .filter((r, i) => rows.findIndex((o) => o.topic === r.topic) === i)
    .map((r) => r.key);
  const reviewed =
    project.structures.length > 0 &&
    project.structures.every((s) => s.options.joineryReviewed === true);
  const box = project.structures.find((s) => s.type === "box");
  return (
    <div className="step-panel">
      <Section title="Proposed joints">
        <ul className="joint-list">
          {rows.map((row) => (
            <li key={row.key} className={row.missing ? "joint missing" : "joint"}>
              <span className="joint-text">{row.text}</span>
              <span className="joint-detail">{row.detail}</span>
              {firstOfTool.includes(row.key) && <AskAboutTool topic={row.topic} />}
              {!asksAbout(shopRecord, row.topic) ? (
                <span className="joint-shop">{row.shop}</span>
              ) : (
                !firstOfTool.includes(row.key) && (
                  <span className="joint-shop">Asking about your tools above.</span>
                )
              )}
            </li>
          ))}
        </ul>
        {box && (
          <Choice
            label="Corners"
            value={
              typeof box.options.cornerJoint === "string"
                ? box.options.cornerJoint
                : DEFAULT_CORNER_JOINT
            }
            options={CHOICES.cornerJoint}
            onChange={(v) => store.getState().apply(setOption(project, box.id, "cornerJoint", v))}
          />
        )}
        {reviewed ? (
          <p className="ok">Joinery accepted. You can still change any joint.</p>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => store.getState().apply(acceptJoinery(project))}
          >
            Accept all
          </button>
        )}
      </Section>
    </div>
  );
}
