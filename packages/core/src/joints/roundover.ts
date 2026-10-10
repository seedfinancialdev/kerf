// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Roundover (Operation specs, "Roundover (user operation)"): a quarter-round profile removed along
// one or more edges, matching a roundover router bit. It never changes the cut list.

import type { Diagnostic, RemovalPrimitive } from "../outputs";
import type { SolvedPart } from "../solve/model";
import type { EdgeRef, Id, Len } from "../types";

export interface RoundedEdge {
  edge: EdgeRef;
  radius: Len;
}

const sideOf = (edge: EdgeRef): string => edge.split("/")[0] ?? "";
const faceOf = (edge: EdgeRef): string => edge.split("/")[1] ?? "";

/**
 * The quarter-round removals for one part, plus problems. Errors:
 * - a radius larger than either dimension next to the edge;
 * - radii on one face, or on both faces of one edge, that together exceed the thickness.
 */
export function deriveRoundovers(
  part: SolvedPart,
  instanceName: string,
  sink: Diagnostic[],
  partId: Id = part.id,
): { cuts: RemovalPrimitive[]; edges: RoundedEdge[] } {
  const edges: RoundedEdge[] = [];
  for (const op of part.ops) for (const edge of op.edges) edges.push({ edge, radius: op.radius });

  let ok = true;
  const fail = (rule: string, message: string): void => {
    ok = false;
    sink.push({
      severity: "error",
      rule,
      message,
      part: partId,
      field: `${instanceName} roundover`,
    });
  };

  for (const { edge, radius } of edges) {
    // The profile lies in the plane across the edge: thickness plus the dimension along the face.
    const side = sideOf(edge);
    const across = side.startsWith("end") ? part.length : part.width;
    if (radius > part.thickness || radius > across) {
      fail(
        "roundover-too-large",
        `The roundover on ${instanceName} is larger than the board is thick or wide.`,
      );
    }
  }

  // Two edges rounded on one face, or one edge rounded on both faces: radii must fit the thickness.
  const groups = new Map<string, number>();
  for (const { edge, radius } of edges) {
    for (const key of [`face:${faceOf(edge)}`, `edge:${sideOf(edge)}`]) {
      groups.set(key, (groups.get(key) ?? 0) + radius);
    }
  }
  for (const [key, total] of groups) {
    const members = edges.filter(({ edge }) =>
      key.startsWith("face:") ? faceOf(edge) === key.slice(5) : sideOf(edge) === key.slice(5),
    );
    if (members.length > 1 && total > part.thickness) {
      fail(
        "roundover-radii-too-large",
        `The roundovers on ${instanceName} together are thicker than the board.`,
      );
    }
  }

  if (!ok) return { cuts: [], edges: [] };
  const cuts: RemovalPrimitive[] = edges
    .map(({ edge, radius }) => ({ kind: "quarterRoundSweep" as const, edge, radius }))
    .sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : a.radius - b.radius));
  return { cuts, edges };
}
