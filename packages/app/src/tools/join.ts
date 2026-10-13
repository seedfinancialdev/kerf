// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Join (Interaction spec, "3D tools"): two clicks, a proposal from the engine (proposeJoint, ADR 015
// rule 6), then Accept or another type. Boards the form made are taken over first, because a
// hand-made joint may not name a generated board (ADR 014, "After review").

import {
  generateStructures,
  type Instance,
  type Joint,
  type JointProposal,
  type PlacedPart,
  type Project,
  ProjectFormatError,
  proposeJoint,
  type ShopProfile,
} from "@kerf/core";
import { detachForEdit, type Edit, instanceOf } from "../model/commands";
import { newId } from "../model/ids";
import type { Proposal, TakenOver } from "../model/pending";
import { shownProject } from "../model/store";
import type { ToolHandler } from "./handler";
import { newProblem } from "./new-problem";

/** How each joint reads in a sentence. */
export const JOINT_WORD: Record<Joint["type"], string> = {
  dado: "a dado",
  rabbet: "a rabbet",
  throughDovetail: "through dovetails",
};

/** True for a board the form still makes, which Join takes over before cutting a joint in it. */
export const isFormBoard = (p: PlacedPart): boolean => p.source !== undefined && !p.detached;

/** The boards by name, a changed name shown beside the old one: "Shelf 1 (now Shelf copy 1) and Back". */
export function namesTaken(taken: readonly TakenOver[]): string {
  return taken.map((t) => (t.from === t.to ? t.from : `${t.from} (now ${t.to})`)).join(" and ");
}

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
  return `${namesTaken(taken)} are now custom; the form won't change them.`;
}

const GONE = "That board is no longer in the project; click it again.";
const UNPLACEABLE = "The project has a problem that stops Kerf placing its boards; fix it first.";

type TakeOver =
  | {
      ok: true;
      project: Project;
      /** `project` with the two boards named as clicked, for the engine's reasons (ruling R41); never applied. */
      scratch: Project;
      a: Instance;
      b: Instance;
      names: [string, string];
      taken: TakenOver[];
    }
  | { ok: false; message: string };

/**
 * `project` with boards `a` and `b` taken over, as an edit would leave them, and their instances
 * there. Shared by `propose` and `acceptProposal` so the engine is asked about the boards Accept
 * will cut. Says why when a board cannot be taken over, is no longer in the project, or is already
 * joined to the other (by a joint of the form too), naming the boards as clicked (ruling R41).
 */
function takeOver(project: Project, shop: ShopProfile, a: PlacedPart, b: PlacedPart): TakeOver {
  let next: Project;
  let formJoints: readonly Joint[];
  try {
    next = detachForEdit(detachForEdit(project, a, shop).project, b, shop).project;
    formJoints = generateStructures(next, shop).joints;
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, message: GONE };
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
  const taken = [
    { placed: a, to: nameA },
    { placed: b, to: nameB },
  ]
    .filter((x) => isFormBoard(x.placed))
    .map((x) => ({ from: x.placed.name, to: x.to }));
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
    ? proposeJoint(taken.scratch, shop, taken.a.id, taken.b.id, newId(), prefer)
    : { ok: false, reason: taken.message };
  return { a: a.instance, b: b.instance, result, taken: taken.ok ? taken.taken : [] };
}

/** What Accept does: the edit, and the notice about boards it took over (if any). */
export type Accepted = { ok: true; edit: Edit; notice?: string } | { ok: false; message: string };

/**
 * Joins `a` and `b` with a joint of `type`, taking over any board the form made first. The label
 * and notice use the boards' names after the take-over; reasons use the names as clicked. Comes back `ok: false`, saying why, when a
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
