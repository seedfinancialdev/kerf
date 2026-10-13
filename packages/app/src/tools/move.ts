// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Move / copy (Interaction spec, "3D tools": Ctrl copies, Shift makes a mirrored copy; axis locks
// and typed distances). A board the form made is taken over first, with a notice (Interaction
// spec, "Tweak"). Domain model: "Mirroring never changes a part's cut list line", so a mirrored
// copy shares its part with the board it came from.

import {
  formatLength,
  gridSize,
  type Id,
  type Instance,
  type PlacedPart,
  type Project,
  type ShopProfile,
  type Vec3,
} from "@kerf/core";
import { detachForEdit, type Edit, instanceOf } from "../model/commands";
import { newId } from "../model/ids";
import type { Pending } from "../model/pending";
import { literalFor, readLength } from "../model/size";
import type { KerfState, KerfStore } from "../model/store";
import { pointOnAxis, pointOnPlane, viewAxis } from "./drag";
import { type ModelPointer, recordedProject, type ToolHandler } from "./handler";

export type MoveMode = "move" | "copy" | "mirror";

/** A move that worked: the edit, and the instances to leave picked (the moved boards or the new copies). */
export type MoveResult = { ok: true; edit: Edit; picked: Id[] } | { ok: false; message: string };

type Axis = 0 | 1 | 2;
const AXES = ["x", "y", "z"] as const;
/** What each locked axis is called at the bench. */
const DIRECTION = ["left to right", "back to front", "up"] as const;
const NO_DISTANCE = "A distance of zero changes nothing.";
const NO_BOARDS = "Select the boards to move first.";

const isZero = (d: Vec3): boolean => d[0] === 0 && d[1] === 0 && d[2] === 0;

/** Only the largest direction of a drag, or only the locked axis (SketchUp's inference lock). */
export function lockedDelta(from: Vec3, to: Vec3, axis: Axis | null): Vec3 {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const sizes = d.map(Math.abs);
  const kept = axis ?? (sizes.indexOf(Math.max(...sizes)) as Axis);
  return [0, 1, 2].map((i) => (i === kept ? d[i] : 0)) as unknown as Vec3;
}

/** Where an instance goes when moved by `delta`: its position written as an exact sum, per axis. */
function shifted(inst: Instance, delta: Vec3, units: Project["units"]): Instance["position"] {
  const out = { ...inst.position };
  for (const [i, key] of AXES.entries()) {
    const d = delta[i] ?? 0;
    if (d !== 0)
      out[key] = `(${inst.position[key]}) ${d > 0 ? "+" : "-"} ${literalFor(Math.abs(d), units)}`;
  }
  return out;
}

/** True once the board is its own: its part is taken over, or its row copy has been taken out. */
function isTakenOver(project: Project, placed: PlacedPart): boolean {
  if (placed.pattern) return instanceOf(project, placed) !== undefined;
  return project.parts.find((d) => d.id === placed.part)?.detached === true;
}

/** "Right side copy", or "Right side copy 2" when that name is taken, so copies can be told apart. */
function copyName(base: string, taken: Set<string | undefined>): string {
  let name = `${base} copy`;
  for (let n = 2; taken.has(name); n += 1) name = `${base} copy ${n}`;
  return name;
}

/** A hand-made copy of `inst`: it is not the form's, so it carries none of the form's marks. */
function copyOf(
  inst: Instance,
  name: string,
  position: Instance["position"],
  mirror: boolean,
): Instance {
  return {
    id: newId(),
    def: inst.def,
    name,
    position,
    orientation: inst.orientation,
    mirrored: mirror ? !inst.mirrored : inst.mirrored,
    ...(inst.parent !== undefined && { parent: inst.parent }),
  };
}

/**
 * Moves the boards by `delta` (project units, exact), or leaves them and adds copies that far away:
 * a mirrored copy runs its length the other way. A board the form made is taken over first, using
 * the project's real `shop`. Comes back `ok: false`, saying why, for no boards, a distance of zero
 * (nothing to record), or a board that cannot be found or taken over.
 */
export function moveBoards(
  project: Project,
  placed: PlacedPart[],
  delta: Vec3,
  mode: MoveMode,
  shop: ShopProfile,
): MoveResult {
  if (placed.length === 0) return { ok: false, message: NO_BOARDS };
  if (isZero(delta)) return { ok: false, message: NO_DISTANCE };
  let next = project;
  const moved: Instance[] = [];
  try {
    for (const p of placed) {
      if (p.source && !p.detached && !isTakenOver(next, p))
        next = detachForEdit(next, p, shop).project;
      const inst = instanceOf(next, p);
      if (!inst)
        return {
          ok: false,
          message: `${p.name} could not be found to move. Click the board again.`,
        };
      moved.push(inst);
    }
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, message: error.message };
    throw error;
  }

  const taken = new Set<string | undefined>(next.instances.map((i) => i.name));
  const added =
    mode === "move"
      ? []
      : moved.map((inst, i) => {
          const name = copyName(placed[i]?.name ?? inst.name ?? "Board", taken);
          taken.add(name);
          return copyOf(inst, name, shifted(inst, delta, project.units), mode === "mirror");
        });
  const instances =
    mode === "move"
      ? next.instances.map((x) => {
          const at = moved.find((m) => m.id === x.id);
          return at ? { ...x, position: shifted(x, delta, project.units) } : x;
        })
      : [...next.instances, ...added];

  const who = placed.length === 1 ? (placed[0]?.name ?? "board") : `${placed.length} boards`;
  const travel = formatLength(Math.max(...delta.map(Math.abs)), project.units);
  const label =
    mode === "move"
      ? `Moved ${who} ${travel}`
      : mode === "copy"
        ? `Copied ${who}`
        : `Mirror-copied ${who}`;
  return {
    ok: true,
    edit: { project: { ...next, instances }, label },
    picked: (mode === "move" ? moved : added).map((i) => i.id),
  };
}

type MovePending = Extract<Pending, { tool: "move" }>;

/**
 * How far the pointer has dragged, measured against what was fixed when the drag began: the locked
 * line, or else the plane facing the viewer. Without a line of sight (a test, a plain pointer) the
 * point under the pointer is used. Null when there is nothing to measure by.
 */
function dragDelta(e: ModelPointer, pending: MovePending, project: Project): Vec3 | null {
  const { from, ray: began, axis } = pending;
  if (e.ray && began) {
    const grid = gridSize(project.units);
    if (axis !== null) {
      return lockedDelta(
        pointOnAxis(began, from, axis, grid),
        pointOnAxis(e.ray, from, axis, grid),
        axis,
      );
    }
    const facing = viewAxis(began);
    return lockedDelta(
      pointOnPlane(began, from, facing, grid),
      pointOnPlane(e.ray, from, facing, grid),
      null,
    );
  }
  return e.hit ? lockedDelta(from, e.hit.point, axis) : null;
}

/** The placed boards the user has picked, as the engine last placed them. */
function selectedBoards(state: KerfState): PlacedPart[] {
  const { selection, solved } = state;
  if (selection.kind !== "boards") return [];
  return (solved?.result.placements ?? []).filter((p) => selection.instances.includes(p.instance));
}

const modeOf = (e: { ctrl: boolean; shift: boolean }): MoveMode =>
  e.ctrl ? "copy" : e.shift ? "mirror" : "move";

/** What a preview was made for, so the same move is not drawn twice; also tells a drag from a click. */
const previewKey = (delta: Vec3, mode: MoveMode): string => `${mode}:${delta.join(",")}`;

/** The notice for boards the form made that this move took over, or undefined when there are none. */
function takeOverNotice(placed: PlacedPart[]): string | undefined {
  const custom = placed.filter((p) => p.source !== undefined && !p.detached);
  const [only] = custom;
  if (!only) return undefined;
  return custom.length === 1
    ? `${only.partName} is now custom; the form won't change it.`
    : `${custom.length} boards are now custom; the form won't change them.`;
}

/** Records a move and leaves the moved boards (or the new copies) picked. */
function finish(
  store: KerfStore,
  placed: PlacedPart[],
  r: Extract<MoveResult, { ok: true }>,
): void {
  const s = store.getState();
  s.apply(r.edit, takeOverNotice(placed));
  s.select({ kind: "boards", instances: r.picked });
  s.setPending(null);
}

/** Drag the picked boards one direction at a time, or type a distance along the locked direction. */
export const moveTool: ToolHandler = {
  pointer(e, store) {
    const s = store.getState();
    const project = recordedProject(store);
    if (!project) return;
    const pending = s.pending?.tool === "move" ? s.pending : null;
    if (e.kind === "down") {
      if (!e.hit) return;
      const picked = selectedBoards(s);
      const dragged = picked.some((p) => p.instance === e.hit?.placed.instance)
        ? picked
        : [e.hit.placed];
      s.select({ kind: "boards", instances: dragged.map((p) => p.instance) });
      s.setPending({
        tool: "move",
        from: e.hit.point,
        ray: e.ray,
        placed: dragged,
        axis: pending?.axis ?? null,
        last: null,
      });
      return;
    }
    if (!pending || pending.placed.length === 0) return;
    const delta = dragDelta(e, pending, project);
    if (!delta) {
      if (e.kind === "up") {
        s.cancelPreview();
        s.setPending(null);
      }
      return;
    }
    const mode = modeOf(e);
    const r = moveBoards(project, pending.placed, delta, mode, s.shop);
    if (e.kind === "move") {
      const key = previewKey(delta, mode);
      if (r.ok && (key !== pending.last || s.previewed === null)) {
        s.preview(r.edit.project);
        s.setPending({ ...pending, last: key });
      } else if (isZero(delta) && s.previewed !== null) {
        // Back at the start: the boards are as they were, so there is nothing to show.
        s.cancelPreview();
      }
      return;
    }
    // Only a drag that showed a preview is recorded; a click never is.
    if (r.ok && pending.last !== null) return finish(store, pending.placed, r);
    // Nothing is recorded. A click that has not moved keeps its pick and its arrow lock so a
    // distance can be typed (final branch review M2); a drag that ended with nothing to record,
    // or was refused, is over.
    s.cancelPreview();
    const refused = !r.ok && !isZero(delta);
    if (refused) s.say(r.message);
    if (pending.last !== null || refused) s.setPending(null);
  },
  prompt(s) {
    if (selectedBoards(s).length === 0) return "Select boards first";
    const axis = s.pending?.tool === "move" ? s.pending.axis : null;
    return axis === null
      ? "Distance (left to right unless you press an arrow key)"
      : `Distance ${DIRECTION[axis]}, e.g. 2"`;
  },
  measure(text, store) {
    const s = store.getState();
    const project = recordedProject(store);
    const boards = selectedBoards(s);
    if (!project || boards.length === 0) return NO_BOARDS;
    const read = readLength(text, project);
    if (!read.ok) return read.message;
    const axis = s.pending?.tool === "move" ? (s.pending.axis ?? 0) : 0;
    const delta = [0, 1, 2].map((i) => (i === axis ? read.value : 0)) as unknown as Vec3;
    const r = moveBoards(project, boards, delta, "move", s.shop);
    if (!r.ok) return r.message;
    finish(store, boards, r);
    return null;
  },
};
