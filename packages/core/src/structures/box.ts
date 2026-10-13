// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The box form (Interaction spec, "Shape"): four walls with the corner joint chosen, a bottom in a
// groove, and the grain wrapping the corners as a continuous-grain match set. Boards are named
// Front, Back, Side A, Side B and Bottom; the two sides share one definition.

import type { Instance, Stock } from "../types";
import { type Builder, depth, type FormSpec } from "./builder";
import { wrap } from "./lengths";
import { WALL_BACK, WALL_FRONT, WALL_SIDE_A, WALL_SIDE_B } from "./orientations";

// joineryReviewed: the user accepted the proposed joinery (ADR 015, D2); it changes no board.
/** The options a box reads: each stock and how a woodworker names it, and the plain settings. */
export const BOX_SPEC = {
  stockLabels: { wallStock: "the walls", bottomStock: "the bottom" },
  textOptions: ["cornerJoint", "bottom", "rabbetDepth", "grooveDepth", "grooveOffset"],
  flags: ["grainWraps", "joineryReviewed"],
} as const satisfies FormSpec;

/** The box form's choices, read and checked once. */
interface BoxForm {
  wall: Stock;
  /** Absent when the form says the box has no bottom. */
  bottomStock: Stock | undefined;
  /** Corners are rabbeted, with the front and back between the sides; otherwise dovetailed. */
  rabbeted: boolean;
  /** `stock["…"].thickness` of the wall. */
  Tw: string;
  /** Overall length, depth (front to back) and height as expressions, parenthesised. */
  L: string;
  D: string;
  H: string;
}

/** Reads the form's options; undefined (with a message) when the box cannot be built. */
function readBoxForm(b: Builder): BoxForm | undefined {
  const wall = b.stock("wallStock");
  if (!wall) return undefined;
  const { size } = b.structure;

  const corner = b.choice("cornerJoint", ["through-dovetail", "rabbet"], "through-dovetail");
  const bottom = b.choice("bottom", ["groove", "none"], "groove");
  const bottomStock = bottom === "none" ? undefined : b.stock("bottomStock");
  if (bottom === "groove" && !bottomStock) return undefined;

  return {
    wall,
    bottomStock,
    rabbeted: corner === "rabbet",
    Tw: b.thickness(wall),
    L: wrap(size.w),
    D: wrap(size.d),
    H: wrap(size.h),
  };
}

/** The four walls. Front and back run between the sides when the corners are rabbeted. */
function buildWalls(
  b: Builder,
  f: BoxForm,
): { front: Instance; back: Instance; sideA: Instance; sideB: Instance } {
  const { wall, Tw, L, D, H, rabbeted } = f;
  // A rabbeted corner has the front and back between the sides, their ends in rabbets cut in the
  // sides; dovetails interlock, so the front and back run the full length.
  const frontLength = rabbeted ? `${L} - 2*${Tw}` : L;
  const frontX = rabbeted ? Tw : "0in";
  const board = (name: string, key: string, length: string) =>
    b.part(key, key, { name, stock: wall.id, length, width: H });
  const frontDef = board("Front", "front", frontLength);
  const backDef = board("Back", "back", frontLength);
  const sideDef = board("Side", "side", D);

  return {
    front: b.instance("front", "front", frontDef, [frontX, "0in", "0in"], {
      name: "Front",
      orientation: WALL_FRONT,
    }),
    sideA: b.instance("side", "side:a", sideDef, ["0in", "0in", "0in"], {
      name: "Side A",
      orientation: WALL_SIDE_A,
    }),
    back: b.instance("back", "back", backDef, [frontX, `${D} - ${Tw}`, "0in"], {
      name: "Back",
      orientation: WALL_BACK,
    }),
    sideB: b.instance("side", "side:b", sideDef, [`${L} - ${Tw}`, "0in", "0in"], {
      name: "Side B",
      orientation: WALL_SIDE_B,
    }),
  };
}

/** The four corner joints: dovetails, or rabbets cut in the sides. */
function joinCorners(
  b: Builder,
  f: BoxForm,
  w: { front: Instance; back: Instance; sideA: Instance; sideB: Instance },
): void {
  if (f.rabbeted) {
    const rabbet = depth(b.option("rabbetDepth"));
    const corners: Array<[Instance, Instance, string]> = [
      [w.sideA, w.front, "a-front"],
      [w.sideA, w.back, "a-back"],
      [w.sideB, w.front, "b-front"],
      [w.sideB, w.back, "b-back"],
    ];
    for (const [host, guest, key] of corners) {
      b.joint("corner", `corner:${key}`, "rabbet", host.id, guest.id, rabbet);
    }
    return;
  }
  const corners: Array<[Instance, Instance, string]> = [
    [w.front, w.sideA, "front-a"],
    [w.front, w.sideB, "front-b"],
    [w.back, w.sideA, "back-a"],
    [w.back, w.sideB, "back-b"],
  ];
  for (const [host, guest, key] of corners) {
    b.joint("corner", `corner:${key}`, "throughDovetail", host.id, guest.id, {});
  }
}

/** The bottom in its groove, and the groove in each wall. */
function seatBottom(
  b: Builder,
  f: BoxForm,
  w: { front: Instance; back: Instance; sideA: Instance; sideB: Instance },
): void {
  const { bottomStock, Tw, L, D } = f;
  if (!bottomStock) return;
  // Left to itself the bottom sits one board's thickness above the wall's edge, so the groove
  // never breaks out through the bottom of the wall.
  const offset = b.option("grooveOffset") ?? b.thickness(bottomStock);
  const def = b.part("bottom", "bottom", {
    name: "Bottom",
    stock: bottomStock.id,
    length: `${L} - 2*${Tw}`,
    width: `${D} - 2*${Tw}`,
  });
  const bottom = b.instance("bottom", "bottom", def, [Tw, Tw, offset], { name: "Bottom" });
  const groove = depth(b.option("grooveDepth"));
  const walls: Array<[Instance, string]> = [
    [w.front, "front"],
    [w.back, "back"],
    [w.sideA, "a"],
    [w.sideB, "b"],
  ];
  for (const [wallInstance, key] of walls) {
    b.joint("bottom", `groove:${key}`, "dado", wallInstance.id, bottom.id, groove);
  }
}

export function generateBox(b: Builder): void {
  const form = readBoxForm(b);
  if (!form) return;
  const walls = buildWalls(b, form);
  joinCorners(b, form, walls);
  seatBottom(b, form, walls);
  if (b.flag("grainWraps")) {
    b.out.matchSets.push({
      id: b.id("matchset:wrap"),
      name: b.named("Grain wraps the corners"),
      type: "continuousGrain",
      members: [walls.front.id, walls.sideA.id, walls.back.id, walls.sideB.id],
      axis: "length",
      generatedBy: b.from("grain"),
    });
  }
}
