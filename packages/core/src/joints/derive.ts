// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline step 4 (Domain model v0, "Solve pipeline"): expand joints between patterns, derive
// each joint's cuts on host and guest in their local frames, and add guest penetration to cut
// length. Pure and deterministic: the same project always gives byte-identical results.

import type { Diagnostic, RemovalPrimitive } from "../outputs";
import type { Frame } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { EdgeRef, Id, Joint, Len, Project } from "../types";
import { deriveDado } from "./dado";
import { deriveDovetail } from "./dovetail";
import { deriveRabbet } from "./rabbet";
import { deriveRoundovers, type RoundedEdge } from "./roundover";
import { seatOf } from "./seat";
import { type CutAdd, type MachinedCut, makeContext, NO_ADD, type PairCut } from "./types";

export interface InstanceCuts {
  /** Removals in the part's definition space, in a fixed order. */
  cuts: RemovalPrimitive[];
  /** What joints add to this instance's cut size. */
  add: CutAdd;
  roundovers: RoundedEdge[];
}

export interface Derived {
  pairs: PairCut[];
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

function overlapInside(a: RemovalPrimitive, b: RemovalPrimitive): boolean {
  if (a.kind !== "box" || b.kind !== "box") return false;
  return [0, 1, 2].every(
    (k) => Math.max(a.min[k] ?? 0, b.min[k] ?? 0) < Math.min(a.max[k] ?? 0, b.max[k] ?? 0),
  );
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
  const membersOf = (id: Id): Id[] => {
    if (frames.has(id) && !patternOfSource.has(id)) return [id];
    return membersOfPattern.get(patternOfSource.get(id) ?? id) ?? [];
  };
  const isPattern = (id: Id): boolean => patternOfSource.has(id) || membersOfPattern.has(id);

  const ctx = makeContext(model, project.units, frames, diagnostics);
  const pairs: PairCut[] = [];

  for (const joint of project.joints) {
    const hosts = membersOf(joint.host);
    const guests = membersOf(joint.guest);
    if (hosts.length === 0 || guests.length === 0) continue; // an upstream part failed; reported there

    const touched = new Set<Id>();
    const hostIsPattern = isPattern(joint.host);
    for (const hostId of hosts) {
      for (const guestId of guests) {
        if (hostId === guestId) continue;
        const host = frames.get(hostId);
        const guest = frames.get(guestId);
        if (!host || !guest) continue;
        const pair = derivePair(ctx, joint, host, guest, hostIsPattern);
        if (pair) {
          pairs.push(pair);
          touched.add(guestId);
        }
      }
    }
    if (!hostIsPattern) continue; // errors were reported pair by pair
    for (const guestId of guests) {
      if (!touched.has(guestId)) {
        diagnostics.push({
          severity: "error",
          rule: "joint-no-contact",
          message: `${frames.get(guestId)?.instance.name ?? "A part"} does not touch any of the parts it should be joined to.`,
          joint: joint.id,
        });
      }
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
  }

  // Overlapping channels on one host are an error (Operation specs, "Dado / groove").
  for (const [id, cuts] of instances) {
    const dados = pairs.filter((p) => p.host === id && p.kind === "dado");
    for (let i = 0; i < dados.length; i += 1) {
      for (let j = i + 1; j < dados.length; j += 1) {
        const a = dados[i]?.hostCuts[0];
        const b = dados[j]?.hostCuts[0];
        if (a && b && overlapInside(a, b)) {
          diagnostics.push({
            severity: "error",
            rule: "dado-overlap",
            message: `Two dados on ${frames.get(id)?.instance.name ?? "a part"} overlap.`,
            part: frames.get(id)?.part.id,
          });
        }
      }
    }
    cuts.cuts = sorted(cuts.cuts);
  }

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
      });
    }
  }

  const machined = pairs.flatMap((p) => p.machined);
  return { pairs, instances, definitionOf, machined, roundedEdges, diagnostics };
}

function derivePair(
  ctx: ReturnType<typeof makeContext>,
  joint: Joint,
  host: Frame,
  guest: Frame,
  quiet: boolean,
): PairCut | undefined {
  if (joint.type === "throughDovetail") return deriveDovetail(ctx, joint, host, guest);
  const seat = seatOf(ctx, joint.id, host, guest, quiet);
  if (!seat) return undefined;
  return joint.type === "dado" ? deriveDado(ctx, joint, seat) : deriveRabbet(ctx, joint, seat);
}
