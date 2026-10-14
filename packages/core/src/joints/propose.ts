// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Join tool's proposal (Interaction spec, "3D tools": "the joint is proposed from the contact
// and the shop profile"). Rules: ADR 015, rule 6. The proposal is tried on a copy of the project
// so a joint the engine would reject is never offered.

import { formatLength } from "../length";
import type { Diagnostic, ToolNeed } from "../outputs";
import { toolFor } from "../outputs/machining";
import { runPipeline } from "../pipeline";
import { type Box, boxOf, boxToLocal, contactOf, type Frame, faceAt } from "../solve/assembly";
import type { Id, Joint, Project, ShopProfile } from "../types";
import { JOINT_WORD } from "../words";

/**
 * The Join tool's answer for two boards (ADR 015, rule 6): the joint to cut, the tool that cuts it
 * and whether the shop lacks that tool, or the reason there is no joint to offer.
 */
export type JointProposal =
  | ({ ok: true; joint: Joint; description: string } & ToolNeed)
  | { ok: false; reason: string };

/** What the user calls a board in a reason: the name the solve gives it ("Shelf 2"). */
const nameOf = (f: Frame): string => f.instance.name;

const refuse = (reason: string): JointProposal => ({ ok: false, reason });

/**
 * A guest standing on a host face is cut as a rabbet when its thickness lies against an end or an
 * edge of the host (a step), and as a dado when that thickness lies in the middle (a channel).
 * The guest's other dimension may run to the host's far side either way; a guest counts as seated
 * for each type as ADR 013, D4 defines, and ADR 015, rule 6 picks the type from where it sits.
 */
function sitsInStep(host: Frame, guest: Frame, patch: Box): boolean {
  // A wrong guess here shows up as the trial solve's error, so the proposal is never offered.
  const thicknessAcross = patch.max[0] - patch.min[0] === guest.part.thickness ? 0 : 1;
  const size = thicknessAcross === 0 ? host.part.length : host.part.width;
  return patch.min[thicknessAcross] === 0 || patch.max[thicknessAcross] === size;
}

const isError = (d: Diagnostic): boolean => d.severity === "error";

/**
 * Identifies a problem across two solves, so errors the new joint causes can be told from old ones.
 */
const errorKey = (d: Diagnostic): string => [d.rule, d.part, d.joint, d.message].join("|");

/**
 * Host is the board touched on its broad face; guest is the other. When neither or both are
 * touched on a broad face, or they do not sit flat, comes back the reason there is no joint, in
 * shop words.
 */
function hostAndGuest(a: Frame, b: Frame, axis: 0 | 1 | 2, at: number): [Frame, Frame] | string {
  const fa = faceAt(a, axis, at);
  const fb = faceAt(b, axis, at);
  const names = `${nameOf(a)} and ${nameOf(b)}`;
  if (!fa || !fb) return `${names} do not sit flat against each other.`;
  const aBroad = fa.axis === 2;
  const bBroad = fb.axis === 2;
  if (aBroad && bBroad) return `${names} lie face to face; glue them, there is no joint to cut.`;
  if (!aBroad && !bBroad) return `${names} meet end to end; Kerf has no joint for that yet.`;
  return aBroad ? [a, b] : [b, a];
}

/**
 * Proposes a joint between two placed boards (ids from `solve(...).placements`), with the tool the
 * shop would use or the one it lacks. Never throws; `jointId` names the joint if it is accepted.
 * A joint is never cut into a board thinner than the one that would sit in it (ADR 015, rule 6):
 * the board touched on its broad face hosts, and if its resolved thickness (stock, or the part's
 * own thickness override) is less than the other's, the reason says so and no joint is offered,
 * whichever type is preferred. Through dovetails, where the boards overlap, are not subject to it.
 */
export function proposeJoint(
  project: Project,
  shop: ShopProfile,
  first: Id,
  second: Id,
  jointId: Id,
  prefer?: Joint["type"],
): JointProposal {
  if (project.joints.some((j) => j.id === jointId))
    return refuse("That joint already exists; pick a different id for the new one.");
  const p = runPipeline(project, shop);
  if (!p.project)
    return refuse("The project has a problem that stops Kerf placing its boards; fix it first.");
  const frameOf = (id: Id): Frame | undefined => {
    const cut = p.parts.find((c) => c.instance.id === id);
    return cut && { instance: cut.instance, part: cut.part };
  };
  const a = frameOf(first);
  const b = frameOf(second);
  if (!a || !b) return refuse("Pick two boards to join.");
  for (const f of [a, b]) {
    if (f.instance.pattern)
      return refuse(`${nameOf(f)} is one of a row; detach it first to join it on its own.`);
  }

  const contact = contactOf(boxOf(a.instance), boxOf(b.instance));
  let type: Joint["type"];
  let host: Frame;
  let guest: Frame;
  if (contact.kind === "touch") {
    const pair = hostAndGuest(a, b, contact.axis, contact.patch.min[contact.axis]);
    if (typeof pair === "string") return refuse(pair);
    [host, guest] = pair;
    if (host.part.thickness < guest.part.thickness)
      return refuse(
        `${nameOf(host)} is thinner than ${nameOf(guest)}, so Kerf won't cut a joint into it; glue or nail it in place.`,
      );
    const patch = boxToLocal(host, contact.patch);
    type = sitsInStep(host, guest, patch) ? "rabbet" : "dado";
  } else if (contact.kind === "overlap") {
    [host, guest] = [a, b];
    type = "throughDovetail";
  } else {
    return refuse(`${nameOf(a)} and ${nameOf(b)} do not touch, so there is nothing to join.`);
  }

  if (prefer) type = prefer;
  const joint: Joint = {
    id: jointId,
    type,
    host: host.instance.id,
    guest: guest.instance.id,
    params: {},
  };
  const trial = runPipeline({ ...p.project, joints: [...p.project.joints, joint] }, shop);
  const known = new Set(p.diagnostics.filter(isError).map(errorKey));
  const problem = trial.diagnostics.find((d) => isError(d) && !known.has(errorKey(d)));
  if (problem) return refuse(problem.message);
  const cut = trial.derived.pairs.find((pair) => pair.joint === jointId)?.machined[0];
  if (!cut) return refuse(`Kerf could not work out the cuts for ${nameOf(guest)}.`);
  const { tool, missing } = toolFor(cut, shop);
  const size = `${formatLength(cut.width, project.units)} wide and ${formatLength(cut.depth, project.units)} deep`;
  return {
    ok: true,
    joint,
    tool,
    missing,
    description: `${nameOf(guest)} in ${JOINT_WORD[type]} in ${nameOf(host)}, ${size}`,
  };
}
