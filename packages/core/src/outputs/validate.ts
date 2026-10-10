// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline step 5 (Domain model v0, "Solve pipeline"): checks that need the whole assembly.
// Per-joint errors and fit checks are raised where the joint is derived; this adds
//   - overlaps between parts that are not joined (ADR 013, decision D5: an error),
//   - a rounded edge that a joint fully hides (a warning),
//   - the box's groove that must land inside a half-pin (a warning).

import type { Derived } from "../joints/derive";
import type { Diagnostic } from "../outputs";
import { boxOf, contactOf, type Frame, toParent } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { Id } from "../types";

function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function validateAssembly(model: SolvedModel, derived: Derived): Diagnostic[] {
  const out: Diagnostic[] = [];
  const partById = new Map(model.parts.map((p) => [p.id, p]));
  const frames = new Map<Id, Frame>();
  for (const instance of model.instances) {
    const part = partById.get(instance.def);
    if (part) frames.set(instance.id, { instance, part });
  }
  const joined = new Set(derived.pairs.map((p) => pairKey(p.host, p.guest)));
  const list = [...frames.values()];

  // Overlaps: sweep along X so a project with thousands of parts stays fast.
  const byX = list
    .map((f) => ({ f, box: boxOf(f.instance) }))
    .sort((a, b) => a.box.min[0] - b.box.min[0]);
  for (let i = 0; i < byX.length; i += 1) {
    const a = byX[i];
    if (!a) continue;
    for (let j = i + 1; j < byX.length; j += 1) {
      const b = byX[j];
      if (!b || b.box.min[0] >= a.box.max[0]) break;
      const c = contactOf(a.box, b.box);
      if (c.kind === "overlap" && !joined.has(pairKey(a.f.instance.id, b.f.instance.id))) {
        out.push({
          severity: "error",
          rule: "overlap",
          message: `This part can't be built: ${a.f.instance.name} and ${b.f.instance.name} occupy the same space and are not joined.`,
          part: a.f.part.id,
        });
      }
    }
  }

  // Rounded edges hidden by a joint: the edge lies wholly inside a patch where a joined part sits.
  for (const { instance, edge } of derived.roundedEdges) {
    const frame = frames.get(instance);
    if (!frame) continue;
    const [side, face] = edge.split("/") as [string, string];
    const { length: L, width: W, thickness: T } = frame.part;
    const z = face === "face0" ? 0 : T;
    const [p, q] =
      side === "edge0"
        ? [
            [0, 0, z],
            [L, 0, z],
          ]
        : side === "edge1"
          ? [
              [0, W, z],
              [L, W, z],
            ]
          : side === "end0"
            ? [
                [0, 0, z],
                [0, W, z],
              ]
            : [
                [L, 0, z],
                [L, W, z],
              ];
    const a = toParent(frame, p as [number, number, number]);
    const b = toParent(frame, q as [number, number, number]);
    const hidden = derived.pairs.some((pair) => {
      const other =
        pair.host === instance ? pair.guest : pair.guest === instance ? pair.host : undefined;
      const otherFrame = other ? frames.get(other) : undefined;
      if (!otherFrame) return false;
      const c = contactOf(boxOf(frame.instance), boxOf(otherFrame.instance));
      if (c.kind !== "touch") return false;
      return [0, 1, 2].every((k) => {
        const lo = Math.min(a[k] ?? 0, b[k] ?? 0);
        const hi = Math.max(a[k] ?? 0, b[k] ?? 0);
        return lo >= (c.patch.min[k] ?? 0) && hi <= (c.patch.max[k] ?? 0);
      });
    });
    if (hidden) {
      out.push({
        severity: "warning",
        rule: "roundover-hidden",
        message: `The roundover on the ${edge.replace("/", " ")} edge of ${frame.instance.name} is hidden by a joint.`,
        part: frame.part.id,
      });
    }
  }

  out.push(...grooveHalfPinWarnings(derived, frames));
  return out;
}

/**
 * Operation specs, keepsake box: the groove "exits through the board ends; on a through-dovetailed
 * box it must land inside the bottom half-pin or it shows on the outside."
 * The half-pin is narrowest where the tails are widest, so the groove is checked against the
 * half-pin width at the shallowest depth it reaches.
 */
function grooveHalfPinWarnings(derived: Derived, frames: Map<Id, Frame>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const warned = new Set<Id>();

  for (const dove of derived.pairs.filter((p) => p.dovetail)) {
    const facts = dove.dovetail;
    if (!facts) continue;
    // Both boards of the corner: the host (pin board) and the guest (tail board).
    const boards: Array<{ id: Id; isHost: boolean }> = [
      { id: dove.host, isHost: true },
      { id: dove.guest, isHost: false },
    ];
    for (const { id, isHost } of boards) {
      if (warned.has(id)) continue;
      const frame = frames.get(id);
      if (!frame) continue;
      const grooves = derived.pairs.filter(
        (p) => p.host === id && p.kind === "dado" && p.machined[0]?.kind === "groove",
      );
      for (const groove of grooves) {
        const g = groove.hostCuts[0];
        if (g?.kind !== "box") continue;
        const W = facts.boardWidth;
        const T = frame.part.thickness;
        const lo = g.min[1];
        const hi = g.max[1];
        const nearEdge0 = lo <= W - hi;
        const halfPin = (isHost ? facts.hostHalfPins : facts.halfPins)[nearEdge0 ? 0 : 1];
        // Depth from the tip face to the shallowest part of the groove (pin board only; on the
        // tail board the space is as wide as the half-pin at the tip along its whole length).
        let allowedNumerator = halfPin * facts.hostThickness;
        if (isHost) {
          const tip = facts.hostTipSide === 0 ? 0 : T;
          const shallow = Math.min(Math.abs(g.min[2] - tip), Math.abs(g.max[2] - tip));
          allowedNumerator += facts.slopeOffset * shallow;
        }
        const edgeDistance = nearEdge0 ? hi : W - lo; // far boundary of the groove from its edge
        if (edgeDistance * facts.hostThickness > allowedNumerator) {
          warned.add(id);
          out.push({
            severity: "warning",
            rule: "groove-outside-bottom-half-pin",
            message: `The groove in ${frame.instance.name} does not land inside the half-pin of the dovetails, so it will show on the outside of the corner.`,
            part: frame.part.id,
          });
          break;
        }
      }
    }
  }
  return out;
}
