// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Roundover (Operation specs, "Roundover (user operation)"): a quarter-round profile removed along
// one or more edges, matching a roundover router bit. It never changes the cut list.

import type { Diagnostic, RemovalPrimitive } from "../outputs";
import type { RuleId } from "../rules";
import type { SolvedPart } from "../solve/model";
import type { EdgeRef, Id, Len } from "../types";

export interface RoundedEdge {
  edge: EdgeRef;
  radius: Len;
}

const sideOf = (edge: EdgeRef): string => edge.split("/")[0] ?? "";
const faceOf = (edge: EdgeRef): string => edge.split("/")[1] ?? "";
const OPPOSITE: Record<string, string> = {
  edge0: "edge1",
  edge1: "edge0",
  end0: "end1",
  end1: "end0",
};

/**
 * The quarter-round removals for one part, plus problems. Errors:
 * - a radius larger than the board is thick or than the dimension along the edge;
 * - two opposite edges of one face, or both faces of one edge, whose radii together exceed the
 *   thickness (the spec: "if both edges of one face are rounded, their radii must sum to
 *   <= thickness");
 * - one edge given two different radii.
 * A repeated edge with the same radius counts once.
 */
export function deriveRoundovers(
  part: SolvedPart,
  instanceName: string,
  sink: Diagnostic[],
  partId: Id = part.id,
): { cuts: RemovalPrimitive[]; edges: RoundedEdge[] } {
  const radii = new Map<EdgeRef, Len>();
  let ok = true;
  const field = `${instanceName} roundover`;
  const fail = (rule: RuleId, message: string): void => {
    ok = false;
    sink.push({ severity: "error", rule, message, part: partId, field });
  };

  for (const op of part.ops) {
    for (const edge of op.edges) {
      const known = radii.get(edge);
      if (known !== undefined && known !== op.radius) {
        fail(
          "roundover-conflict",
          `The ${edge.replace("/", " ")} edge of ${instanceName} is rounded with two different radii.`,
        );
      }
      radii.set(edge, op.radius);
    }
  }

  const edges: RoundedEdge[] = [...radii].map(([edge, radius]) => ({ edge, radius }));
  for (const { edge, radius } of edges) {
    // The profile lies in the plane across the edge: the thickness and the length of the edge's side.
    const across = sideOf(edge).startsWith("end") ? part.length : part.width;
    if (radius > part.thickness || radius > across) {
      fail(
        "roundover-too-large",
        `The roundover on ${instanceName} is larger than the board is thick or wide.`,
      );
    }
  }

  // Pairs that compete for the same thickness: both faces of one edge, or opposite edges of a face.
  for (const [i, first] of edges.entries()) {
    for (const second of edges.slice(i + 1)) {
      const sameEdge = sideOf(first.edge) === sideOf(second.edge);
      const oppositeEdges =
        faceOf(first.edge) === faceOf(second.edge) &&
        OPPOSITE[sideOf(first.edge)] === sideOf(second.edge);
      if ((sameEdge || oppositeEdges) && first.radius + second.radius > part.thickness) {
        fail(
          "roundover-radii-too-large",
          `The roundovers on ${instanceName} together are thicker than the board.`,
        );
      }
    }
  }

  if (!ok) return { cuts: [], edges: [] };
  const cuts: RemovalPrimitive[] = edges
    .map(({ edge, radius }) => ({ kind: "quarterRoundSweep" as const, edge, radius }))
    .sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : a.radius - b.radius));
  return { cuts, edges };
}
