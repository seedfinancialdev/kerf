// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline step 5 (Domain model v0, "Solve pipeline"): checks that need the whole assembly.
// Per-joint errors and fit checks are raised where the joint is derived; this adds
//   - overlaps between parts that are not joined (ADR 013, decision D5: an error),
//   - a rounded edge that a joint fully hides (a warning),
//   - the box's groove that must land inside a half-pin (a warning).
// Overlap reporting is bounded: the first few are named, the rest are counted.

import type { Derived } from "../joints/derive";
import { selfTouchingPairs } from "../joints/spatial";
import type { Diagnostic } from "../outputs";
import { boxOf, contactOf, type Frame, toParent } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { Id } from "../types";

/** How many overlapping pairs are named before the rest are only counted. */
const OVERLAPS_SHOWN = 10;

/** Touching or overlapping pairs examined; a real assembly has about as many as it has parts. */
const MAX_TOUCHING_PAIRS = 1_000_000;

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
  // Parts a joint tried to join may overlap where the joint says so, even if it failed.
  const joined = new Set([
    ...derived.pairs.map((p) => pairKey(p.host, p.guest)),
    ...derived.attempted.map(([a, b]) => pairKey(a, b)),
  ]);
  const list = [...frames.values()];

  // Overlaps, found with a sweep along the axis the parts are most spread over, so a project with
  // thousands of parts stays fast.
  const touching = selfTouchingPairs(
    list.map((f) => boxOf(f.instance)),
    MAX_TOUCHING_PAIRS,
  );
  const exhausted = touching.length > MAX_TOUCHING_PAIRS;
  let overlapping = 0;
  for (const [i, j] of touching) {
    const a = list[i];
    const b = list[j];
    if (!a || !b) continue;
    const c = contactOf(boxOf(a.instance), boxOf(b.instance));
    if (c.kind !== "overlap" || joined.has(pairKey(a.instance.id, b.instance.id))) continue;
    overlapping += 1;
    if (overlapping <= OVERLAPS_SHOWN) {
      out.push({
        severity: "error",
        rule: "overlap",
        message: `This part can't be built: ${a.instance.name} and ${b.instance.name} occupy the same space and are not joined.`,
        part: a.part.id,
        field: a.instance.name,
      });
    }
  }
  if (exhausted) {
    out.push({
      severity: "error",
      rule: "overlap",
      message: `More than ${MAX_TOUCHING_PAIRS.toLocaleString("en-US")} pairs of parts touch or overlap; the parts are piled on top of each other and were not checked further.`,
    });
  } else if (overlapping > OVERLAPS_SHOWN) {
    out.push({
      severity: "error",
      rule: "overlap",
      message: `${overlapping} pairs of parts occupy the same space and are not joined (the first ${OVERLAPS_SHOWN} are listed).`,
      count: overlapping,
    });
  }

  const pairsOf = new Map<Id, Derived["pairs"]>();
  for (const pair of derived.pairs) {
    for (const id of pair.host === pair.guest ? [pair.host] : [pair.host, pair.guest]) {
      const list = pairsOf.get(id) ?? [];
      list.push(pair);
      pairsOf.set(id, list);
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
    const hidden = (pairsOf.get(instance) ?? []).some((pair) => {
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
        field: `${frame.instance.name} roundover`,
      });
    }
  }

  out.push(...grooveHalfPinWarnings(derived, frames, pairsOf));
  return out;
}

/**
 * Operation specs, keepsake box: the groove "exits through the board ends; on a through-dovetailed
 * box it must land inside the bottom half-pin or it shows on the outside."
 * The half-pin is narrowest where the tails are widest, so the groove is checked against the
 * half-pin width at the shallowest depth it reaches.
 */
function grooveHalfPinWarnings(
  derived: Derived,
  frames: Map<Id, Frame>,
  pairsOf: Map<Id, Derived["pairs"]>,
): Diagnostic[] {
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
      const grooves = (pairsOf.get(id) ?? []).filter(
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
        // Half-pins are listed from the tail board's edge0; the pin board may run the other way.
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
            field: `${frame.instance.name} groove`,
          });
          break;
        }
      }
    }
  }
  return out;
}
