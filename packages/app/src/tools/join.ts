// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Join (Interaction spec, "3D tools"): two clicks, a proposal from the engine (proposeJoint, ADR 015
// rule 6), then Accept or another type. Boards the form made are taken over first, because a
// hand-made joint may not name a generated board (ADR 014, "After review").

import {
  type Instance,
  type Joint,
  type JointProposal,
  type PlacedPart,
  type Project,
  proposeJoint,
  type ShopProfile,
} from "@kerf/core";
import { detachForEdit, type Edit, instanceOf } from "../model/commands";
import { newId } from "../model/ids";
import type { Proposal } from "../model/pending";
import { shownProject } from "../model/store";
import type { ToolHandler } from "./handler";
import { newProblem } from "./new-problem";

/** How each joint reads in a sentence. */
export const JOINT_WORD: Record<Joint["type"], string> = {
  dado: "a dado",
  rabbet: "a rabbet",
  throughDovetail: "through dovetails",
};

/** A board the form made that Join takes over: its name before and after. */
export interface TakenOver {
  from: string;
  to: string;
}

/** True for a board the form still makes, which Join takes over before cutting a joint in it. */
export const isFormBoard = (p: PlacedPart): boolean => p.source !== undefined && !p.detached;

/**
 * The sentence that tells the user which boards were taken over and that the form will leave them
 * alone; a board whose name changed (a copy taken out of a row) shows both names. Undefined when
 * no board was taken over.
 */
export function takeOverNotice(taken: readonly TakenOver[]): string | undefined {
  const [first, second] = taken;
  if (!first) return undefined;
  if (!second) {
    return first.from === first.to
      ? `${first.from} is now custom; the form won't change it.`
      : `${first.from} becomes ${first.to}, custom; the form won't change it.`;
  }
  const named = taken.map((t) => (t.from === t.to ? t.from : `${t.from} (now ${t.to})`));
  return `${named.join(" and ")} are now custom; the form won't change them.`;
}

type TakeOver =
  | { ok: true; project: Project; a: Instance; b: Instance; taken: TakenOver[] }
  | { ok: false; message: string };

/**
 * `project` with boards `a` and `b` taken over, as an edit would leave them, and their instances
 * there. Shared by `propose` and `acceptProposal` so the engine is asked about the boards Accept
 * will cut. Says why when a board cannot be taken over or is no longer in the project.
 */
function takeOver(project: Project, shop: ShopProfile, a: PlacedPart, b: PlacedPart): TakeOver {
  let next: Project;
  try {
    next = detachForEdit(detachForEdit(project, a, shop).project, b, shop).project;
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, message: error.message };
    throw error;
  }
  const ia = instanceOf(next, a);
  const ib = instanceOf(next, b);
  if (!ia || !ib) return { ok: false, message: "One of the boards is no longer in the project." };
  const taken = [
    { placed: a, now: ia },
    { placed: b, now: ib },
  ]
    .filter((x) => isFormBoard(x.placed))
    .map((x) => ({ from: x.placed.name, to: x.now.name ?? x.placed.name }));
  return { ok: true, project: next, a: ia, b: ib, taken };
}

/**
 * What the engine suggests for boards `a` and `b` from where they touch and what the shop can cut,
 * or why it cannot, asked of the boards as they will be once taken over (ruling R38). The proposal
 * names the boards as clicked. `prefer` asks for one type of joint instead of the engine's first choice.
 */
export function propose(
  project: Project,
  shop: ShopProfile,
  a: PlacedPart,
  b: PlacedPart,
  prefer?: Joint["type"],
): Proposal {
  const taken = takeOver(project, shop, a, b);
  const result: JointProposal = taken.ok
    ? proposeJoint(taken.project, shop, taken.a.id, taken.b.id, newId(), prefer)
    : { ok: false, reason: taken.message };
  return { a: a.instance, b: b.instance, result };
}

/** What Accept does: the edit, and the notice about boards it took over (if any). */
export type Accepted = { ok: true; edit: Edit; notice?: string } | { ok: false; message: string };

/**
 * Joins `a` and `b` with a joint of `type`, taking over any board the form made first. The label
 * and notice use the boards' names after the take-over. Comes back `ok: false`, saying why, when a
 * board cannot be taken over (the engine's reason) or is gone, the engine finds no such joint (the
 * boards do not touch, say), or the full solve finds an error the project did not have.
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
  const r = proposeJoint(taken.project, shop, taken.a.id, taken.b.id, newId(), type);
  if (!r.ok) return { ok: false, message: r.reason };
  const [host, guest] = r.joint.host === taken.a.id ? [taken.a, taken.b] : [taken.b, taken.a];
  const joined = { ...taken.project, joints: [...taken.project.joints, r.joint] };
  const problem = newProblem(project, joined, shop);
  if (problem) return { ok: false, message: problem };
  return {
    ok: true,
    edit: {
      project: joined,
      label: `Joined ${guest.name} to ${host.name} with ${JOINT_WORD[type]}`,
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
