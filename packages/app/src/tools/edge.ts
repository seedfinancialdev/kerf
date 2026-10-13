// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Edge profile (Interaction spec, "3D tools": "Add a roundover to edges, using bits from the shop
// profile"). Shelves the form makes keep following it: their roundover is the form's (ADR 015, D3).

import {
  type EdgeRef,
  formatLength,
  type Len,
  type PlacedPart,
  type Project,
  type ShopProfile,
} from "@kerf/core";
import { addRoundover, type Edit, setShelfRoundover } from "../model/commands";

/** The front edge on both faces (Operation specs, bookcase: edge1/face0 and edge1/face1). */
export const BOTH_FRONT_EDGES: EdgeRef[] = ["edge1/face0", "edge1/face1"];

const EDGE_WORDS: Record<string, string> = {
  edge1: "Front edge",
  edge0: "Back edge",
  end0: "First end",
  end1: "Second end",
};
const FACE_WORDS: Record<string, string> = { face1: "show face", face0: "inside face" };

/** "edge1/face1" → "Front edge, show face" (Interaction spec, "Shop language"). */
export function edgeName(edge: EdgeRef): string {
  const [e, f] = edge.split("/") as [string, string];
  return `${EDGE_WORDS[e]}, ${FACE_WORDS[f]}`;
}

const isFormShelf = (p: PlacedPart): boolean => p.source?.role === "shelf" && !p.detached;
const sameEdges = (a: EdgeRef[], b: EdgeRef[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** "Top" for one board, "3 boards" for several; copies of one board are named by the board. */
function boardsIn(placed: PlacedPart[], first: PlacedPart): string {
  return placed.length === 1 ? first.partName : `${placed.length} boards`;
}

/**
 * Rounds `edges` of the picked boards with a bit of `radius` (null: no roundover), as one
 * History entry. Picking the form's shelves and both front edges changes the form's own shelf
 * roundover so they keep resizing; any other board is taken over first.
 * Throws RangeError when a board cannot be taken over (see `addRoundover`).
 */
export function roundEdges(
  project: Project,
  placed: PlacedPart[],
  edges: EdgeRef[],
  radius: Len | null,
  shop: ShopProfile,
): Edit {
  const [first] = placed;
  if (!first) return { project, label: "No boards picked" };
  if (placed.every(isFormShelf) && sameEdges(edges, BOTH_FRONT_EDGES) && first.source) {
    return setShelfRoundover(project, first.source.structure, radius);
  }
  const boards = boardsIn(placed, first);
  if (radius === null) {
    const parts = new Set(placed.map((p) => p.part));
    const stripped = project.parts.map((d) =>
      parts.has(d.id) ? { ...d, ops: d.ops.filter((op) => op.type !== "roundover") } : d,
    );
    return { project: { ...project, parts: stripped }, label: `No roundover on ${boards}` };
  }
  // Copies of one board share its part, so each part gets the roundover once.
  const byPart = [...new Map(placed.map((p) => [p.part, p])).values()];
  let next = project;
  for (const p of byPart) next = addRoundover(next, p, edges, radius, shop).project;
  return { project: next, label: `Roundover ${formatLength(radius, project.units)} on ${boards}` };
}
