// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Join tool's proposal (Interaction spec, "3D tools": "the joint is proposed from the contact
// and the shop profile"). Rules: ADR 015, rule 6. The proposal is tried on a copy of the project
// so a joint the engine would reject is never offered.

import { formatLength } from "../length";
import type { Diagnostic, MachiningSetup } from "../outputs";
import { toolFor } from "../outputs/machining";
import { runPipeline } from "../pipeline";
import { type Box, boxOf, boxToLocal, contactOf, type Frame, faceAt } from "../solve/assembly";
import type { Id, Joint, Project, ShopProfile } from "../types";

export type JointProposal =
  | { ok: true; joint: Joint; tool: MachiningSetup["tool"]; missing: boolean; description: string }
  | { ok: false; reason: string };

const refuse = (reason: string): JointProposal => ({ ok: false, reason });

/**
 * A guest standing on a host face is cut as a rabbet when its thickness lies against an end or an
 * edge of the host (a step), and as a dado when that thickness lies in the middle (a channel).
 * The guest's other dimension may run to the host's far side either way (ADR 013, D4).
 */
function sitsInStep(host: Frame, guest: Frame, patch: Box): boolean {
  // A wrong guess here shows up as the trial solve's error, so the proposal is never offered.
  const thicknessAcross = patch.max[0] - patch.min[0] === guest.part.thickness ? 0 : 1;
  const size = thicknessAcross === 0 ? host.part.length : host.part.width;
  return patch.min[thicknessAcross] === 0 || patch.max[thicknessAcross] === size;
}

const isError = (d: Diagnostic): boolean => d.severity === "error";

/** Identifies a problem across two solves, so errors the new joint causes can be told from old ones. */
const errorKey = (d: Diagnostic): string => [d.rule, d.part, d.joint, d.message].join("|");

/** Host is the board touched on its broad face; null when neither or both are. */
function hostAndGuest(a: Frame, b: Frame, axis: 0 | 1 | 2, at: number): [Frame, Frame] | string {
  const fa = faceAt(a, axis, at);
  const fb = faceAt(b, axis, at);
  const names = `${a.instance.name} and ${b.instance.name}`;
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
      return refuse(`${f.instance.name} is one of a row; detach it first to join it on its own.`);
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
        `${host.instance.name} is thinner than ${guest.instance.name}, so Kerf won't cut a joint into it; glue or nail it in place.`,
      );
    const patch = boxToLocal(host, contact.patch);
    type = sitsInStep(host, guest, patch) ? "rabbet" : "dado";
  } else if (contact.kind === "overlap") {
    [host, guest] = [a, b];
    type = "throughDovetail";
  } else {
    return refuse(
      `${a.instance.name} and ${b.instance.name} do not touch, so there is nothing to join.`,
    );
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
  if (!cut) return refuse(`Kerf could not work out the cuts for ${guest.instance.name}.`);
  const { tool, missing } = toolFor(cut, shop);
  const what = type === "dado" ? "a dado" : type === "rabbet" ? "a rabbet" : "through dovetails";
  const size = `${formatLength(cut.width, project.units)} wide and ${formatLength(cut.depth, project.units)} deep`;
  return {
    ok: true,
    joint,
    tool,
    missing,
    description: `${guest.instance.name} in ${what} in ${host.instance.name}, ${size}`,
  };
}
