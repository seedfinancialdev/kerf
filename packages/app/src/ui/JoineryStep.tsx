// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// 4. Joinery (Interaction spec; ADR 015, D2): the joints the form chose, what the shop can cut, and
// Accept all. Where the engine offers another joint (box corners) the choice is here too.

import { acceptJoinery, setOption } from "../model/commands";
import { joineryRows } from "../model/joinery";
import { CHOICES } from "../model/labels";
import { shownProject } from "../model/store";
import { Choice } from "./Choice";
import { Section } from "./Section";
import { useKerf, useKerfStore } from "./useKerf";

export function JoineryStep() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const joints = useKerf((s) => s.solved?.result.joints);
  if (!project || !joints) {
    return <p className="empty">Start a project first: go to Start and click New.</p>;
  }
  const rows = joineryRows(joints, project.units);
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
              <span className="joint-shop">{row.shop}</span>
            </li>
          ))}
        </ul>
        {box && (
          <Choice
            label="Corners"
            value={
              typeof box.options.cornerJoint === "string"
                ? box.options.cornerJoint
                : "through-dovetail"
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
