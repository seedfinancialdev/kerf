// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline step 4 (Domain model v0, "Solve pipeline"): expand joints between patterns, derive
// each joint's cuts on host and guest in their local frames, and add guest penetration to cut
// length. Pure and deterministic: the same project always gives byte-identical results.

import type { Diagnostic, RemovalPrimitive } from "../outputs";
import { type Box, boxOf, contactOf, type Frame } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { EdgeRef, Id, Joint, Len, Project } from "../types";
import { deriveDado } from "./dado";
import { deriveDovetail } from "./dovetail";
import { deriveRabbet } from "./rabbet";
import { deriveRoundovers, type RoundedEdge } from "./roundover";
import { seatOf } from "./seat";
import { touchingPairs } from "./spatial";
import { type CutAdd, type MachinedCut, makeContext, NO_ADD, type PairCut } from "./types";

/** Most touching host/guest pairs one joint is derived for; beyond it the joint is an error. */
export const MAX_JOINT_PAIRS = 100_000;

export interface InstanceCuts {
  /** Removals in the part's definition space, in a fixed order. */
  cuts: RemovalPrimitive[];
  /** What joints add to this instance's cut size. */
  add: CutAdd;
  roundovers: RoundedEdge[];
}

export interface Derived {
  pairs: PairCut[];
  /** Host/guest pairs a joint tried to join and reported on (or suppressed reports on) when it failed. */
  attempted: Array<[Id, Id]>;
  instances: Map<Id, InstanceCuts>;
  /** The definition each instance belongs to; differs from its def when cuts forced a split. */
  definitionOf: Map<Id, Id>;
  machined: MachinedCut[];
  roundedEdges: Array<{ instance: Id; edge: EdgeRef; radius: Len }>;
  diagnostics: Diagnostic[];
}

function keyOf(p: RemovalPrimitive): string {
  return JSON.stringify(p);
}

function sorted(list: RemovalPrimitive[]): RemovalPrimitive[] {
  return [...list].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function boxesOverlap(a: RemovalPrimitive, b: RemovalPrimitive): boolean {
  if (a.kind !== "box" || b.kind !== "box") return false;
  return [0, 1, 2].every(
    (k) => Math.max(a.min[k] ?? 0, b.min[k] ?? 0) < Math.min(a.max[k] ?? 0, b.max[k] ?? 0),
  );
}

export function emptyDerived(): Derived {
  return {
    pairs: [],
    attempted: [],
    instances: new Map(),
    definitionOf: new Map(),
    machined: [],
    roundedEdges: [],
    diagnostics: [],
  };
}

export function deriveJoints(project: Project, model: SolvedModel): Derived {
  const diagnostics: Diagnostic[] = [];
  const partById = new Map(model.parts.map((p) => [p.id, p]));
  const frames = new Map<Id, Frame>();
  const membersOfPattern = new Map<Id, Id[]>();
  for (const instance of model.instances) {
    const part = partById.get(instance.def);
    if (!part) continue;
    frames.set(instance.id, { instance, part });
    if (instance.pattern) {
      const list = membersOfPattern.get(instance.pattern.id) ?? [];
      list.push(instance.id);
      membersOfPattern.set(instance.pattern.id, list);
    }
  }
  const patternOfSource = new Map(project.patterns.map((p) => [p.source, p.id]));
  const membersOf = (id: Id): Frame[] => {
    const ids =
      frames.has(id) && !patternOfSource.has(id)
        ? [id]
        : (membersOfPattern.get(patternOfSource.get(id) ?? id) ?? []);
    return ids.map((i) => frames.get(i)).filter((f): f is Frame => f !== undefined);
  };
  const isPattern = (id: Id): boolean => patternOfSource.has(id) || membersOfPattern.has(id);

  const ctx = makeContext(model, project.units, frames, diagnostics);
  const pairs: PairCut[] = [];
  const attempted: Array<[Id, Id]> = [];

  for (const joint of project.joints) {
    const hosts = membersOf(joint.host);
    const guests = membersOf(joint.guest);
    if (hosts.length === 0 || guests.length === 0) continue; // an upstream part failed; reported there

    // Only parts whose boxes touch can be joined; finding them must not cost hosts x guests.
    const candidates = touchingPairs(
      hosts.map((h): Box => boxOf(h.instance)),
      guests.map((g): Box => boxOf(g.instance)),
      MAX_JOINT_PAIRS,
    );
    if (candidates.length > MAX_JOINT_PAIRS) {
      diagnostics.push({
        severity: "error",
        rule: "joint-too-many-pairs",
        message: `This joint would join more than ${MAX_JOINT_PAIRS.toLocaleString("en-US")} pairs of parts (${hosts.length} against ${guests.length}), which is more than Kerf will work out. The parts are probably overlapping by mistake.`,
        joint: joint.id,
        field: `${joint.type} between patterns`,
      });
      continue;
    }
    const quiet = isPattern(joint.host) || isPattern(joint.guest);
    const joinedGuest = new Set<number>();
    const reportedGuest = new Set<number>();
    const overlapGuest = new Set<number>();

    for (const [hi, gi] of candidates) {
      const host = hosts[hi] as Frame;
      const guest = guests[gi] as Frame;
      if (host.instance.id === guest.instance.id) continue;
      const before = ctx.reported();
      const pair = derivePair(ctx, joint, host, guest, quiet);
      if (pair) {
        pairs.push(pair);
        joinedGuest.add(gi);
      } else if (ctx.reported() > before) {
        // Said (or counted, past the limit on how many are said) by the joint itself.
        reportedGuest.add(gi);
        attempted.push([host.instance.id, guest.instance.id]);
      } else if (contactOf(boxOf(host.instance), boxOf(guest.instance)).kind === "overlap") {
        // A quiet pair of patterns that interpenetrate; the assembly check names it as an overlap.
        overlapGuest.add(gi);
      }
    }

    // A guest nothing joined, and nothing explained, does not touch what it should.
    const lost = guests.filter(
      (_, gi) => !joinedGuest.has(gi) && !reportedGuest.has(gi) && !overlapGuest.has(gi),
    );
    if (lost.length > 0) {
      const first = lost[0] as Frame;
      diagnostics.push({
        severity: "error",
        rule: "joint-no-contact",
        message:
          lost.length === 1
            ? `${first.instance.name} does not touch ${hosts.length === 1 ? (hosts[0] as Frame).instance.name : "any of the parts it should be joined to"}, so there is nothing to join.`
            : `${lost.length} parts (starting with ${first.instance.name}) do not touch any of the parts they should be joined to.`,
        joint: joint.id,
        part: first.part.id,
        field: `${first.instance.name} ${joint.type}`,
        ...(lost.length > 1 ? { count: lost.length } : {}),
      });
    }
  }

  // Accumulate per instance.
  const instances = new Map<Id, InstanceCuts>();
  const entry = (id: Id): InstanceCuts => {
    let found = instances.get(id);
    if (!found) {
      found = { cuts: [], add: NO_ADD, roundovers: [] };
      instances.set(id, found);
    }
    return found;
  };
  const byHost = new Map<Id, PairCut[]>();
  for (const pair of pairs) {
    const host = entry(pair.host);
    host.cuts.push(...pair.hostCuts);
    host.add = {
      length: host.add.length + pair.hostAdd.length,
      width: host.add.width + pair.hostAdd.width,
    };
    const guest = entry(pair.guest);
    guest.cuts.push(...pair.guestCuts);
    guest.add = {
      length: guest.add.length + pair.guestAdd.length,
      width: guest.add.width + pair.guestAdd.width,
    };
    if (pair.kind === "dado") {
      const list = byHost.get(pair.host) ?? [];
      list.push(pair);
      byHost.set(pair.host, list);
    }
  }

  // Overlapping channels on one host are an error (Operation specs, "Dado / groove"). Sorted by
  // where each starts, so only neighbours are compared.
  for (const [id, dados] of byHost) {
    const boxes = dados
      .map((d) => d.hostCuts[0])
      .filter((c): c is Extract<RemovalPrimitive, { kind: "box" }> => c?.kind === "box")
      .sort((a, b) => a.min[0] - b.min[0] || a.min[1] - b.min[1]);
    let overlaps = 0;
    let active: Array<Extract<RemovalPrimitive, { kind: "box" }>> = [];
    for (const b of boxes) {
      active = active.filter((a) => a.max[0] > b.min[0]);
      for (const a of active) if (boxesOverlap(a, b)) overlaps += 1;
      active.push(b);
    }
    if (overlaps > 0) {
      const frame = frames.get(id);
      diagnostics.push({
        severity: "error",
        rule: "dado-overlap",
        message: `${overlaps === 1 ? "Two dados" : `${overlaps} pairs of dados`} on ${frame?.instance.name ?? "a part"} overlap.`,
        part: frame?.part.id,
        field: `${frame?.instance.name ?? "part"} dado`,
        ...(overlaps > 1 ? { count: overlaps } : {}),
      });
    }
  }
  for (const cuts of instances.values()) cuts.cuts = sorted(cuts.cuts);

  // Roundovers are stored on the part, so every instance of it gets them.
  const roundedEdges: Derived["roundedEdges"] = [];
  const reported = new Set<Id>();
  for (const frame of frames.values()) {
    if (frame.part.ops.length === 0) continue;
    const local: Diagnostic[] = [];
    const rounded = deriveRoundovers(frame.part, frame.instance.name, local);
    if (!reported.has(frame.part.id)) {
      diagnostics.push(...local);
      reported.add(frame.part.id);
    }
    const target = entry(frame.instance.id);
    target.cuts = sorted([...target.cuts, ...rounded.cuts]);
    target.roundovers = rounded.edges;
    for (const edge of rounded.edges) {
      roundedEdges.push({ instance: frame.instance.id, ...edge });
    }
  }

  // Instances of one definition must have identical cuts; if they would not, split (ADR 013, D7).
  const definitionOf = new Map<Id, Id>();
  const byDef = new Map<Id, Id[]>();
  for (const frame of frames.values()) {
    const list = byDef.get(frame.part.id) ?? [];
    list.push(frame.instance.id);
    byDef.set(frame.part.id, list);
  }
  for (const [defId, ids] of byDef) {
    const signatures: string[] = [];
    for (const id of ids) {
      const cuts = instances.get(id);
      const signature = JSON.stringify([cuts?.cuts ?? [], cuts?.add ?? NO_ADD]);
      let index = signatures.indexOf(signature);
      if (index === -1) {
        signatures.push(signature);
        index = signatures.length - 1;
      }
      definitionOf.set(id, index === 0 ? defId : `${defId}~${index}`);
    }
    if (signatures.length > 1) {
      const name = partById.get(defId)?.name ?? "A part";
      diagnostics.push({
        severity: "info",
        rule: "definition-split",
        message: `The copies of ${name} get different cuts, so they are tracked as separate parts.`,
        part: defId,
        field: name,
      });
    }
  }

  ctx.flush();
  const machined = pairs.flatMap((p) => p.machined);
  return { pairs, attempted, instances, definitionOf, machined, roundedEdges, diagnostics };
}

function derivePair(
  ctx: ReturnType<typeof makeContext>,
  joint: Joint,
  host: Frame,
  guest: Frame,
  quiet: boolean,
): PairCut | undefined {
  if (joint.type === "throughDovetail") return deriveDovetail(ctx, joint, host, guest, quiet);
  const seat = seatOf(ctx, joint.id, host, guest, quiet);
  if (!seat) return undefined;
  return joint.type === "dado" ? deriveDado(ctx, joint, seat) : deriveRabbet(ctx, joint, seat);
}
