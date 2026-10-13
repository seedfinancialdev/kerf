// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Board (Interaction spec, "3D tools": "Draw a board from stock; drawn between two parts, its
// length binds to the gap"). Thickness is always the stock's. A board between two boards takes the
// engine's gap expression (ADR 015, rule 7) as its length, so it follows every resize.

import {
  formatLength,
  gapBetween,
  generateStructures,
  gridSize,
  type Id,
  type Len,
  orientationFor,
  type Project,
  type ShopProfile,
  type SolvedInstance,
  solveModel,
  type Vec3,
} from "@kerf/core";
import type { Edit } from "../model/commands";
import { newId } from "../model/ids";
import { literalFor, readLength } from "../model/size";
import type { KerfStore } from "../model/store-types";
import { floorPoint, OFF_THE_FLOOR } from "./drag";
import { newProblem } from "./edit-outcome";
import { type ModelPointer, recordedProject, type ToolHandler } from "./handler";

type Axis = 0 | 1 | 2;
const AXES = ["x", "y", "z"] as const;
const NO_SIZE = "A board needs a length and a width above zero.";
const NO_STOCK = "Add a stock to the project first.";
/** The maintainer's decision (2026-10-13; ADR 015, rule 7): no binding to form boards yet. */
const FORM_MADE =
  "Boards the form made can't be measured between yet; " +
  "use Divide to add shelves, or take a side over first.";

/** A new board: the change, and the instance to leave picked. */
export type DrawnBoard = Edit & { picked: Id };
/** A board fitted between two others: the change and the board to leave picked, or why not. */
export type BetweenResult = { ok: true; edit: Edit; picked: Id } | { ok: false; message: string };

const unit = (axis: Axis): Vec3 => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];

/** "Board 1", "Board 2" …: the next name no part has (part names are unique). */
function nextBoardName(project: Project): string {
  const used = new Set(project.parts.map((p) => p.name));
  let n = 1;
  while (used.has(`Board ${n}`)) n += 1;
  return `Board ${n}`;
}

/** Adds a part of `stock` and one instance of it; sizes and position are expressions. */
function addBoard(
  project: Project,
  stock: Id,
  size: { length: string; width: string },
  position: Record<"x" | "y" | "z", string>,
  orientation: number,
): { project: Project; name: string; instance: Id } {
  const name = nextBoardName(project);
  const part = { id: newId(), name, stock, ...size, grainLocked: false, ops: [] };
  const instance = { id: newId(), def: part.id, name, position, orientation, mirrored: false };
  return {
    project: {
      ...project,
      parts: [...project.parts, part],
      instances: [...project.instances, instance],
    },
    name,
    instance: instance.id,
  };
}

/**
 * A board of `stock` with its lowest corner at `corner`, `length` and `width` running along two
 * different project axes (0 x, 1 y, 2 z); its thickness is the stock's. Sizes are project units.
 * Throws RangeError for a size of zero or less, or for two sizes along one axis.
 */
export function drawBoard(
  project: Project,
  stock: Id,
  corner: Vec3,
  length: { axis: Axis; size: Len },
  width: { axis: Axis; size: Len },
): DrawnBoard {
  if (length.size <= 0 || width.size <= 0) throw new RangeError(NO_SIZE);
  const position = {
    x: literalFor(corner[0], project.units),
    y: literalFor(corner[1], project.units),
    z: literalFor(corner[2], project.units),
  };
  const made = addBoard(
    project,
    stock,
    {
      length: literalFor(length.size, project.units),
      width: literalFor(width.size, project.units),
    },
    position,
    orientationFor(unit(length.axis), unit(width.axis)),
  );
  return { project: made.project, label: `Added ${made.name}`, picked: made.instance };
}

/**
 * Where a board can sit across the gap between boards `a` and `b` (`along` is the gap's axis,
 * `across` the one the board's width runs on): the front edge it lines up with, and the room back
 * from there. The front is the far end of the span the two share (ruling R35). The room stops at
 * the nearest other board that crosses the gap at the new board's height behind that front (the
 * back panel), or at the boards' own near edge.
 */
function freeRoomAcross(
  solved: SolvedInstance[],
  [a, b]: [Id, Id],
  axes: { along: "x" | "y" | "z"; across: "x" | "y" | "z" },
  board: { height: Len; thickness: Len },
): { front: Len; room: Len } {
  const { along, across } = axes;
  // gapBetween found both boards, so the model has them.
  const [low, high] = solved
    .filter((i) => i.id === a || i.id === b)
    .sort((x, y) => x.position[along] - y.position[along]);
  if (!low || !high) throw new Error("gapBetween accepted boards the model does not have.");
  const spanned = [low, high];
  const near = Math.max(...spanned.map((i) => i.position[across]));
  const front = Math.min(...spanned.map((i) => i.position[across] + i.extent[across]));
  const gapStart = low.position[along] + low.extent[along];
  const gapEnd = high.position[along];
  const crossesGap = (i: SolvedInstance): boolean =>
    i.id !== a &&
    i.id !== b &&
    i.position[along] < gapEnd &&
    i.position[along] + i.extent[along] > gapStart &&
    i.position.z < board.height + board.thickness &&
    i.position.z + i.extent.z > board.height &&
    i.position[across] + i.extent[across] <= front;
  const limit = Math.max(
    near,
    ...solved.filter(crossesGap).map((i) => i.position[across] + i.extent[across]),
  );
  return { front, room: front - limit };
}

/**
 * A board spanning the gap between boards `a` and `b`, lying flat with its low face `height` up
 * (the height of the first click, so a board is fitted where the user pointed; ADR 015, rule 7,
 * and ruling R35). It sits flush with the front edges of the two boards (the far end of the span
 * they share). `widthSize` is measured back from there; null reaches back to the nearest other
 * board crossing the gap at that height (the back panel), or the full shared span. Its length is
 * the engine's gap expression, so it follows every resize. Comes back `ok: false`, saying why, when
 * either board is one the form makes (the engine binds only saved boards), the stock is not in the
 * project, the boards have no gap (the engine's reason), are one above the other, there is no free
 * room, the width is zero or less, or the full solve finds a new error.
 */
export function boardBetween(
  project: Project,
  stock: Id,
  a: Id,
  b: Id,
  height: Len,
  widthSize: Len | null,
  shop: ShopProfile,
): BetweenResult {
  if (anyFormMade(project, shop, [a, b])) return { ok: false, message: FORM_MADE };
  const thickness = project.stock.find((s) => s.id === stock)?.thickness;
  if (thickness === undefined) return { ok: false, message: NO_STOCK };
  const gap = gapBetween(project, a, b);
  if (!gap.ok) return { ok: false, message: gap.reason };
  const lengthAxis = AXES.indexOf(gap.axis) as Axis;
  if (lengthAxis === 2) {
    return {
      ok: false,
      message:
        "A board between two boards one above the other is not supported yet; draw it on the lower board.",
    };
  }
  if (widthSize !== null && widthSize <= 0) return { ok: false, message: NO_SIZE };
  const widthAxis: Axis = lengthAxis === 0 ? 1 : 0;
  const { front, room } = freeRoomAcross(
    solveModel(project).instances,
    [a, b],
    { along: gap.axis, across: AXES[widthAxis] },
    { height, thickness },
  );
  if (room <= 0) return { ok: false, message: "There is no free room between those boards there." };
  if (widthSize !== null && widthSize > room) {
    return {
      ok: false,
      message: `There is no room for a board that wide there; the most is ${formatLength(room, project.units)}.`,
    };
  }
  const width = widthSize ?? room;
  const position = { x: "0in", y: "0in", z: literalFor(height, project.units) };
  position[AXES[widthAxis]] = literalFor(front - width, project.units);
  position[gap.axis] = gap.start;
  const made = addBoard(
    project,
    stock,
    { length: gap.length, width: literalFor(width, project.units) },
    position,
    orientationFor(unit(lengthAxis), unit(widthAxis)),
  );
  const problem = newProblem(project, made.project, shop);
  if (problem) return { ok: false, message: problem };
  const names = [a, b].map((id) => project.instances.find((i) => i.id === id)?.name ?? "a board");
  return {
    ok: true,
    edit: {
      project: made.project,
      label: `Added ${made.name} between ${names[0]} and ${names[1]}`,
    },
    picked: made.instance,
  };
}

/**
 * True when any of `ids` is a board the form makes: in the generated project, not the saved one.
 */
function anyFormMade(project: Project, shop: ShopProfile, ids: Id[]): boolean {
  const unsaved = ids.filter((id) => !project.instances.some((i) => i.id === id));
  if (unsaved.length === 0) return false;
  const generated = generateStructures(project, shop).instances;
  return unsaved.some((id) => generated.some((i) => i.id === id));
}

/** The stock a new board is drawn in: the one chosen in the inspector, else the first sheet. */
export function boardStockFor(project: Project, chosen: Id | null): Id | undefined {
  return (
    project.stock.find((s) => s.id === chosen)?.id ??
    project.stock.find((s) => s.kind === "sheet")?.id
  );
}

/** Picks the new board, so its details are at hand (ruling R19). */
const pick = (store: KerfStore, instance: Id): void =>
  store.getState().select({ kind: "boards", instances: [instance] });

/** Fits a board between the board first clicked and the one clicked now. */
function fitBetween(
  store: KerfStore,
  project: Project,
  stock: Id,
  first: { instance: Id; point: Vec3 },
  second: Id,
): void {
  const s = store.getState();
  const r = boardBetween(project, stock, first.instance, second, first.point[2], null, s.shop);
  if (r.ok) {
    s.apply(r.edit);
    pick(store, r.picked);
  } else {
    s.say(r.message);
  }
  store.getState().setPending(null);
}

/**
 * Click a board or the floor, then type its length and width, or click a second board to fit one
 * between.
 */
export const boardTool: ToolHandler = {
  pointer(e: ModelPointer, store) {
    if (e.kind !== "down") return;
    const s = store.getState();
    const project = recordedProject(store);
    if (!project) return;
    const stock = boardStockFor(project, s.boardStock);
    if (!stock) {
      s.say(NO_STOCK);
      s.setPending(null);
      return;
    }
    const first = s.pending?.tool === "board" ? s.pending.from : null;
    if (first?.placed && e.hit && e.hit.placed.instance !== first.placed.instance) {
      fitBetween(
        store,
        project,
        stock,
        { instance: first.placed.instance, point: first.point },
        e.hit.placed.instance,
      );
      return;
    }
    const point = e.hit?.point ?? floorPoint(e.ray, gridSize(project.units));
    if (point) s.setPending({ tool: "board", from: { placed: e.hit?.placed ?? null, point } });
    else s.say(OFF_THE_FLOOR);
  },
  prompt: (s) =>
    s.pending?.tool === "board"
      ? 'Length, width (e.g. 24", 6"), or click a second board'
      : "Click a board or the floor",
  measure(text, store) {
    const s = store.getState();
    const project = recordedProject(store);
    if (!project) return "Start a project first.";
    const pending = s.pending?.tool === "board" ? s.pending : null;
    if (!pending) return "Click where the board starts first.";
    const stock = boardStockFor(project, s.boardStock);
    if (!stock) return NO_STOCK;
    const sizes = text.split(",").map((t) => t.trim());
    if (sizes.length !== 2) return 'Type the length and width, like 24", 6".';
    const [lengthText = "", widthText = ""] = sizes;
    const length = readLength(lengthText, project);
    if (!length.ok) return length.message;
    const width = readLength(widthText, project);
    if (!width.ok) return width.message;
    if (length.value <= 0 || width.value <= 0) return NO_SIZE;
    const drawn = drawBoard(
      project,
      stock,
      pending.from.point,
      { axis: 0, size: length.value },
      { axis: 1, size: width.value },
    );
    const problem = newProblem(project, drawn.project, s.shop);
    if (problem) return problem;
    s.apply(drawn);
    pick(store, drawn.picked);
    store.getState().setPending(null);
    return null;
  },
};
