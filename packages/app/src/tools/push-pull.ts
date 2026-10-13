// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Push/Pull (Interaction spec, "3D tools"): change a board's length or width from one end or edge;
// thickness belongs to the stock. A board the form made is taken over first, with a notice.

import {
  formatLength,
  type Len,
  type PlacedPart,
  type Project,
  type ShopProfile,
  solveModel,
  type Vec3,
} from "@kerf/core";
import { detachForEdit, type Edit, type EditResult, instanceOf } from "../model/commands";
import { literalFor, readLength } from "../model/size";
import type { KerfStore } from "../model/store";
import type { ToolHandler } from "./handler";

export type BoardFace = "end0" | "end1" | "edge0" | "edge1";

const same = (a: Vec3, b: Vec3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const negated = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** Which face of the board an outward direction belongs to. */
export function faceOf(placed: PlacedPart, normal: Vec3): BoardFace | "thickness" {
  const { x, y } = placed.frame;
  if (same(normal, x)) return "end1";
  if (same(normal, negated(x))) return "end0";
  if (same(normal, y)) return "edge1";
  if (same(normal, negated(y))) return "edge0";
  return "thickness";
}

const NO_DISTANCE = "A distance of zero changes nothing.";
const THICKNESS_LOCKED = "A board's thickness is set by its stock. Pick an end or an edge.";

/**
 * Moves one end or edge outward by `distance` (inward when negative), in project units. The far
 * end or edge stays where it was. A board the form made is taken over first, using the project's
 * real `shop`. Comes back `ok: false`, saying why, for a distance of zero (nothing to record), when
 * the board would be left with no size, or when it cannot be found or taken over.
 */
export function pushPull(
  project: Project,
  placed: PlacedPart,
  face: BoardFace,
  distance: Len,
  shop: ShopProfile,
): EditResult {
  if (distance === 0) return { ok: false, message: NO_DISTANCE };
  let taken: ReturnType<typeof detachForEdit>;
  try {
    taken = detachForEdit(project, placed, shop);
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, message: error.message };
    throw error;
  }
  const inst = instanceOf(taken.project, placed);
  const def = inst && taken.project.parts.find((d) => d.id === inst.def);
  if (!inst || !def)
    return {
      ok: false,
      message: `${placed.partName} could not be found to change. Click the board again.`,
    };

  const lengthwise = face.startsWith("end");
  const along = lengthwise ? placed.frame.x : placed.frame.y;
  const k = along.findIndex((n) => n !== 0) as 0 | 1 | 2;
  const key = (["x", "y", "z"] as const)[k];
  // The board's position is its low corner, so moving an end that faces down the axis moves it too.
  const facesDown = (along[k] ?? 0) < 0 === face.endsWith("1");
  const d = literalFor(Math.abs(distance), project.units);
  const outward = distance >= 0;
  const dimension = lengthwise ? "length" : "width";

  const nextDef = { ...def, [dimension]: `(${def[dimension]}) ${outward ? "+" : "-"} ${d}` };
  const nextInst = facesDown
    ? {
        ...inst,
        position: {
          ...inst.position,
          [key]: `(${inst.position[key]}) ${outward ? "-" : "+"} ${d}`,
        },
      }
    : inst;
  const next: Project = {
    ...taken.project,
    parts: taken.project.parts.map((x) => (x.id === def.id ? nextDef : x)),
    instances: taken.project.instances.map((x) => (x.id === inst.id ? nextInst : x)),
  };

  const problem = solveModel(next).diagnostics.find(
    (x) => x.severity === "error" && x.part === def.id,
  );
  if (problem) return { ok: false, message: problem.message };
  const verb = lengthwise ? ["Lengthened", "Shortened"] : ["Widened", "Narrowed"];
  const label = `${outward ? verb[0] : verb[1]} ${placed.partName} by ${formatLength(Math.abs(distance), project.units)}`;
  return { ok: true, edit: { project: next, label } };
}

/** How far a drag travelled along a face's outward direction (exact: points are on the grid). */
export function travelAlong(from: Vec3, to: Vec3, normal: Vec3): Len {
  return (
    (to[0] - from[0]) * normal[0] + (to[1] - from[1]) * normal[1] + (to[2] - from[2]) * normal[2]
  );
}

/** History's current project: drags and typed sizes are measured from what was recorded. */
function recorded(store: KerfStore): Project | null {
  const h = store.getState().history;
  return h?.entries[h.at]?.project ?? null;
}

/**
 * Applies one Push/Pull, with the take-over notice when the form made the board. A board taken out
 * of a row gets a new instance, so a pick of it follows (the store prunes picks only when History
 * moves).
 */
function finish(store: KerfStore, placed: PlacedPart, edit: Edit): void {
  const taken = placed.source !== undefined && !placed.detached;
  // Read before applying: the store drops a pick of an instance the edit removed.
  const { selection } = store.getState();
  store
    .getState()
    .apply(edit, taken ? `${placed.partName} is now custom; the form won't change it.` : undefined);
  const s = store.getState();
  const now = instanceOf(edit.project, placed);
  if (now && selection.kind === "boards" && selection.instances.includes(placed.instance)) {
    s.select({
      kind: "boards",
      instances: selection.instances.map((id) => (id === placed.instance ? now.id : id)),
    });
  }
  s.setPending(null);
}

/** Click an end or edge, then drag (previewed, recorded on release) or type a distance. */
export const pushPullTool: ToolHandler = {
  pointer(e, store) {
    const s = store.getState();
    const project = recorded(store);
    if (!project) return;
    if (e.kind === "down") {
      if (!e.hit) return;
      if (faceOf(e.hit.placed, e.hit.normal) === "thickness") {
        s.say(THICKNESS_LOCKED);
        return;
      }
      s.setPending({ tool: "pushPull", hit: e.hit, dragged: null });
      return;
    }
    if (s.pending?.tool !== "pushPull") return;
    const pending = s.pending;
    const { placed, normal, point } = pending.hit;
    const distance = e.hit ? travelAlong(point, e.hit.point, normal) : null;
    const r =
      distance === null || distance === 0
        ? null
        : pushPull(project, placed, faceOf(placed, normal) as BoardFace, distance, s.shop);
    if (e.kind === "move") {
      if (r?.ok && (r.edit.label !== pending.dragged || s.previewed === null)) {
        s.preview(r.edit.project);
        s.setPending({ ...pending, dragged: r.edit.label });
      } else if (distance === 0 && s.previewed !== null) {
        // Back at the start: the board is as it was, so there is nothing to show.
        s.cancelPreview();
      }
      return;
    }
    if (r?.ok && pending.dragged !== null) return finish(store, placed, r.edit);
    // Nothing is recorded. A click that has not moved keeps its pick so a distance can be typed;
    // a drag that ended with nothing to record is over.
    s.cancelPreview();
    if (r && !r.ok) s.say(r.message);
    if (pending.dragged !== null || (r && !r.ok)) s.setPending(null);
  },
  prompt: (s) => (s.pending?.tool === "pushPull" ? 'Distance, e.g. 1"' : "Click an end or edge"),
  measure(text, store) {
    const s = store.getState();
    const pending = s.pending?.tool === "pushPull" ? s.pending : null;
    if (!pending) return "Click an end or edge of a board first.";
    const project = recorded(store);
    if (!project) return "Start a project first.";
    const read = readLength(text, project);
    if (!read.ok) return read.message;
    const { placed, normal } = pending.hit;
    const face = faceOf(placed, normal) as BoardFace;
    const r = pushPull(project, placed, face, read.value, s.shop);
    if (!r.ok) return r.message;
    finish(store, placed, r.edit);
    return null;
  },
};
