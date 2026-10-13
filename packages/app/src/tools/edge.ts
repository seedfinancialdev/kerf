// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Edge profile (Interaction spec, "3D tools": "Add a roundover to edges, using bits from the shop
// profile"). Shelves the form makes keep following it: their roundover is the form's (ADR 015, D3).
// Any other board the form made is taken over first.

import {
  type EdgeRef,
  formatLength,
  type Len,
  type PlacedPart,
  type Project,
  type ShopProfile,
  serializeProject,
} from "@kerf/core";
import {
  addRoundover,
  type Edit,
  type EditResult,
  setShelfRoundover,
  TakeOverError,
  withoutRoundoverOn,
} from "../model/commands";

/** The front edge on both faces (Operation specs, bookcase: edge1/face0 and edge1/face1). */
export const BOTH_FRONT_EDGES: EdgeRef[] = ["edge1/face0", "edge1/face1"];

const NOTHING_TO_REMOVE: EditResult = {
  ok: false,
  message: "There's no roundover on those edges to remove.",
};
const ok = (edit: Edit): EditResult => ({ ok: true, edit });
const sameProject = (a: Project, b: Project): boolean =>
  serializeProject(a) === serializeProject(b);
/**
 * The boards to round, one for each board that can be taken over on its own: copies of one board
 * share its part, but a row's members are taken out one by one, the last first so the places of
 * those still to do do not move.
 */
function boardsToTakeOver(placed: PlacedPart[]): PlacedPart[] {
  const key = (p: PlacedPart): string =>
    p.pattern ? `${p.pattern.id}/${p.pattern.index}` : p.part;
  const distinct = [...new Map(placed.map((p) => [key(p), p])).values()];
  return distinct.sort((a, b) => (b.pattern?.index ?? 0) - (a.pattern?.index ?? 0));
}

const isFormShelf = (p: PlacedPart): boolean => p.source?.role === "shelf" && !p.detached;
const sameEdges = (a: EdgeRef[], b: EdgeRef[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** "Top" for one board, "3 boards" for several; copies of one board are named by the board. */
function boardsIn(placed: PlacedPart[], first: PlacedPart): string {
  return placed.length === 1 ? first.partName : `${placed.length} boards`;
}

/**
 * Rounds `edges` of the picked boards with a bit of `radius` (null: take the roundover off those
 * edges), as one History entry. Picking only the form's shelves and both front edges changes the
 * form's own shelf roundover so they keep resizing; any other board is taken over first, and an
 * edge that already has a roundover gets the new one instead. Refuses, saying why, when there is
 * no roundover on the chosen edges to take off or a board cannot be taken over.
 */
export function roundEdges(
  project: Project,
  placed: PlacedPart[],
  edges: EdgeRef[],
  radius: Len | null,
  shop: ShopProfile,
): EditResult {
  const [first] = placed;
  if (!first) return { ok: false, message: "Pick a board first." };
  const boards = boardsIn(placed, first);
  if (placed.every(isFormShelf) && sameEdges(edges, BOTH_FRONT_EDGES) && first.source) {
    const edit = setShelfRoundover(project, first.source.structure, radius);
    return radius === null && sameProject(edit.project, project) ? NOTHING_TO_REMOVE : ok(edit);
  }
  if (radius === null) {
    const parts = new Set(placed.map((p) => p.part));
    const cleared = project.parts.map((d) =>
      parts.has(d.id) ? { ...d, ops: withoutRoundoverOn(d.ops, edges) } : d,
    );
    const next = { ...project, parts: cleared };
    if (sameProject(next, project)) return NOTHING_TO_REMOVE;
    return ok({ project: next, label: `No roundover on ${boards}` });
  }
  let next = project;
  try {
    for (const p of boardsToTakeOver(placed))
      next = addRoundover(next, p, edges, radius, shop).project;
  } catch (error) {
    if (error instanceof TakeOverError) return { ok: false, message: error.message };
    throw error;
  }
  return ok({
    project: next,
    label: `Roundover ${formatLength(radius, project.units)} on ${boards}`,
  });
}
