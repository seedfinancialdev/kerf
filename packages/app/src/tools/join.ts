// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Join (Interaction spec, "3D tools"): two clicks, a proposal from the engine (proposeJoint, ADR 015
// rule 6), then Accept or another type. Boards the form made are taken over first, because a
// hand-made joint may not name a generated board (ADR 014, "After review").

import {
  type Joint,
  type PlacedPart,
  type Project,
  proposeJoint,
  type ShopProfile,
} from "@kerf/core";
import { detachForEdit, type EditResult, instanceOf } from "../model/commands";
import { newId } from "../model/ids";
import type { Proposal } from "../model/pending";
import { shownProject } from "../model/store";
import type { ToolHandler } from "./handler";
import { newProblem } from "./new-problem";

export type { Proposal };

/** How each joint reads in a sentence. */
export const JOINT_WORD: Record<Joint["type"], string> = {
  dado: "a dado",
  rabbet: "a rabbet",
  throughDovetail: "through dovetails",
};

/**
 * What the engine suggests for boards `a` and `b` from where they touch and what the shop can cut,
 * or why it cannot. `prefer` asks for one type of joint instead of the engine's first choice.
 */
export function propose(
  project: Project,
  shop: ShopProfile,
  a: PlacedPart,
  b: PlacedPart,
  prefer?: Joint["type"],
): Proposal {
  return {
    a: a.instance,
    b: b.instance,
    result: proposeJoint(project, shop, a.instance, b.instance, newId(), prefer),
  };
}

/**
 * Joins `a` and `b` with a joint of `type`, taking over any board the form made first. Comes back
 * `ok: false`, saying why, when the engine finds no such joint (the boards do not touch, say),
 * a board is gone, or the full solve finds an error the project did not have.
 * Throws RangeError when a board cannot be taken over (see `detachForEdit`).
 */
export function acceptProposal(
  project: Project,
  shop: ShopProfile,
  a: PlacedPart,
  b: PlacedPart,
  type: Joint["type"],
): EditResult {
  let next = detachForEdit(project, a, shop).project;
  next = detachForEdit(next, b, shop).project;
  const ia = instanceOf(next, a);
  const ib = instanceOf(next, b);
  if (!ia || !ib) return { ok: false, message: "One of the boards is no longer in the project." };
  const r = proposeJoint(next, shop, ia.id, ib.id, newId(), type);
  if (!r.ok) return { ok: false, message: r.reason };
  const host = r.joint.host === ia.id ? a : b;
  const guest = host === a ? b : a;
  const joined = { ...next, joints: [...next.joints, r.joint] };
  const problem = newProblem(project, joined, shop);
  if (problem) return { ok: false, message: problem };
  return {
    ok: true,
    edit: {
      project: joined,
      label: `Joined ${guest.name} to ${host.name} with ${JOINT_WORD[type]}`,
    },
  };
}

/** The first click picks a board; the second asks the engine for a joint between the two. */
export const joinTool: ToolHandler = {
  pointer(e, store) {
    if (e.kind !== "down" || !e.hit) return;
    const s = store.getState();
    const project = shownProject(s);
    if (!project) return;
    const firstId = s.pending?.tool === "join" ? s.pending.first : null;
    const first = s.solved?.result.placements.find((p) => p.instance === firstId);
    if (!first || first.instance === e.hit.placed.instance) {
      s.setPending({ tool: "join", first: e.hit.placed.instance });
      s.setProposal(null);
      return;
    }
    s.setProposal(propose(project, s.shop, first, e.hit.placed));
    s.setPending(null);
  },
  prompt: (s) => (s.pending?.tool === "join" ? "Click the second board" : "Click the first board"),
};
