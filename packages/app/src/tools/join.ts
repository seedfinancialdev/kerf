// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Join (Interaction spec, "3D tools"): two clicks, a proposal from the engine (proposeJoint, ADR
// 015 rule 6), then Accept or another type. Boards the form made are taken over first, because a
// hand-made joint may not name a generated board (ADR 014, "After review").

import {
  generateStructures,
  type Instance,
  JOINT_WORD,
  type Joint,
  type PlacedPart,
  type Project,
  ProjectFormatError,
  proposeJoint,
  type ShopProfile,
  solve,
} from "@kerf/core";
import {
  detachForEdit,
  type Edit,
  instanceOf,
  TakeOverError,
  UNPLACEABLE,
} from "../model/commands";
import { newId } from "../model/ids";
import type { Proposal, TakenOver } from "../model/pending";
import { shownProject } from "../model/store";
import { takenOver, takeOverNotice } from "../model/take-over";
import { newProblem } from "./edit-outcome";
import type { ToolHandler } from "./handler";

const GONE = "That board is no longer in the project; click it again.";

type TakeOver =
  | {
      ok: true;
      project: Project;
      /**
       * `project` with the two boards named as clicked, for the engine's reasons (ADR 015, ruling E);
       * never applied.
       */
      scratch: Project;
      a: Instance;
      b: Instance;
      names: [string, string];
      /** Every board the form made that the take-over takes, the other side of a pair too. */
      taken: TakenOver[];
    }
  | { ok: false; message: string };

/**
 * `project` with boards `a` and `b` taken over, as an edit would leave them, and their instances
 * there. Shared by `propose` and `acceptProposal` so the engine is asked about the boards Accept
 * will cut. Says why when a board cannot be taken over, is no longer in the project, or is already
 * joined to the other (by a joint of the form too), naming the boards as clicked (ADR 015, ruling E).
 */
function takeOver(project: Project, shop: ShopProfile, a: PlacedPart, b: PlacedPart): TakeOver {
  let next: Project;
  let formJoints: readonly Joint[];
  try {
    next = detachForEdit(detachForEdit(project, a, shop).project, b, shop).project;
    formJoints = generateStructures(next, shop).joints;
  } catch (error) {
    if (error instanceof TakeOverError) return { ok: false, message: error.message };
    if (error instanceof ProjectFormatError) return { ok: false, message: UNPLACEABLE };
    throw error;
  }
  const ia = instanceOf(next, a);
  const ib = instanceOf(next, b);
  if (!ia || !ib) return { ok: false, message: GONE };
  const joined = formJoints.some(
    (j) => (j.host === ia.id && j.guest === ib.id) || (j.host === ib.id && j.guest === ia.id),
  );
  if (joined) return { ok: false, message: `${a.name} and ${b.name} are already joined.` };
  const nameA = ia.name ?? a.name;
  const nameB = ib.name ?? b.name;
  const taken = takenOver(solve(project, shop).placements, next);
  const clicked = new Map([
    [ia.id, a.name],
    [ib.id, b.name],
  ]);
  const scratch = {
    ...next,
    instances: next.instances.map((i) => {
      const name = clicked.get(i.id);
      return name === undefined ? i : { ...i, name };
    }),
  };
  return { ok: true, project: next, scratch, a: ia, b: ib, names: [nameA, nameB], taken };
}

/**
 * What the engine suggests for boards `a` and `b` from where they touch and what the shop can cut,
 * or why it cannot, asked of the boards as they will be once taken over (ADR 015, ruling E). The proposal
 * names the boards as clicked. `prefer` asks for one type of joint instead of the engine's first
 * choice.
 */
export function propose(
  project: Project,
  shop: ShopProfile,
  a: PlacedPart,
  b: PlacedPart,
  prefer?: Joint["type"],
): Proposal {
  const taken = takeOver(project, shop, a, b);
  if (!taken.ok)
    return { a: a.instance, b: b.instance, result: { ok: false, reason: taken.message } };
  const r = proposeJoint(taken.scratch, shop, taken.a.id, taken.b.id, newId(), prefer);
  if (!r.ok) return { a: a.instance, b: b.instance, result: r };
  // The engine's joint names the take-over's scratch ids; only its type is kept (Accept proposes
  // again from the boards as clicked).
  const { joint, ...offered } = r;
  return {
    a: a.instance,
    b: b.instance,
    result: { ...offered, type: joint.type, taken: taken.taken },
  };
}

/** What Accept does: the edit, and the notice about boards it took over (if any). */
export type Accepted = { ok: true; edit: Edit; notice?: string } | { ok: false; message: string };

/**
 * Joins `a` and `b` with a joint of `type`, taking over any board the form made first. The label
 * and notice use the boards' names after the take-over; reasons use the names as clicked. Comes
 * back `ok: false`, saying why, when a board cannot be taken over (the engine's reason) or is gone,
 * the engine finds no such joint (the boards do not touch, say), or the full solve finds an error
 * the project did not have.
 */
export function acceptProposal(
  project: Project,
  shop: ShopProfile,
  a: PlacedPart,
  b: PlacedPart,
  type: Joint["type"],
): Accepted {
  const taken = takeOver(project, shop, a, b);
  if (!taken.ok) return taken;
  const r = proposeJoint(taken.scratch, shop, taken.a.id, taken.b.id, newId(), type);
  if (!r.ok) return { ok: false, message: r.reason };
  const [hostName, guestName] =
    r.joint.host === taken.a.id ? taken.names : [taken.names[1], taken.names[0]];
  const joined = { ...taken.project, joints: [...taken.project.joints, r.joint] };
  const problem = newProblem(project, joined, shop);
  if (problem) return { ok: false, message: problem };
  return {
    ok: true,
    edit: {
      project: joined,
      label: `Joined ${guestName} to ${hostName} with ${JOINT_WORD[type]}`,
    },
    notice: takeOverNotice(taken.taken),
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
