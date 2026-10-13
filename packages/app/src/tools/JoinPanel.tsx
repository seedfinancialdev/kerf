// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Join proposal: what the engine suggests, whether the shop can cut it, Accept, or another type.

import type { Joint } from "@kerf/core";
import { shownProject } from "../model/store";
import { Section } from "../ui/Section";
import { useKerf, useKerfStore } from "../ui/useKerf";
import { acceptProposal, isFormBoard, JOINT_WORD, propose } from "./join";

const OTHER: Partial<Record<Joint["type"], Joint["type"]>> = { dado: "rabbet", rabbet: "dado" };

/** The Join tool's panel: a reason, or the proposed joint with Accept and the other type. */
export function JoinPanel() {
  const store = useKerfStore();
  const proposal = useKerf((s) => s.proposal);
  const solved = useKerf((s) => s.solved);
  if (!proposal) return <p className="empty">Click two touching boards.</p>;
  if (!proposal.result.ok) {
    return (
      <p role="note" className="empty">
        {proposal.result.reason}
      </p>
    );
  }
  const { joint, missing, description } = proposal.result;
  /**
   * The shown project and the two boards in its solve, so both come from one state (`solved` is
   * the solve of `shownProject`). When a board is gone, says so and drops the stale proposal.
   */
  const current = () => {
    const s = store.getState();
    const project = shownProject(s);
    const placed = s.solved?.result.placements ?? [];
    const a = placed.find((p) => p.instance === proposal.a);
    const b = placed.find((p) => p.instance === proposal.b);
    if (project && a && b) return { s, project, a, b };
    s.say("Those boards have changed; click them again.");
    s.setProposal(null);
    return null;
  };
  const accept = (): void => {
    const now = current();
    if (!now) return;
    const { s, project, a, b } = now;
    const r = acceptProposal(project, s.shop, a, b, joint.type);
    if (!r.ok) {
      s.say(r.message);
      return;
    }
    s.apply(r.edit, r.notice);
    s.setProposal(null);
  };
  const custom = (solved?.result.placements ?? [])
    .filter((p) => (p.instance === proposal.a || p.instance === proposal.b) && isFormBoard(p))
    .map((p) => p.name);
  const other = OTHER[joint.type];
  const tryOther = (): void => {
    const now = current();
    if (now && other) now.s.setProposal(propose(now.project, now.s.shop, now.a, now.b, other));
  };
  return (
    <Section title="Proposed joint">
      <p>{description}</p>
      <p className="muted">
        {missing ? "Your shop has no tool for this cut yet." : "Your tools can cut this."}
      </p>
      {custom.length > 0 && <p className="muted">Accepting makes {custom.join(" and ")} custom.</p>}
      <div className="button-row">
        <button type="button" className="primary" onClick={accept}>
          Accept
        </button>
        {other && (
          <button type="button" onClick={tryOther}>
            Use {JOINT_WORD[other]} instead
          </button>
        )}
      </div>
    </Section>
  );
}
