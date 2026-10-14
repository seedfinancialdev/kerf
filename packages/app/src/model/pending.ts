// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool has started and not finished. Kept apart from the store and the tool handlers so
// that both can name these types without importing each other.

import type { Id, Joint, PlacedPart, ToolNeed, Vec3 } from "@kerf/core";

/**
 * Where the pointer is on the model: the board, the point (project units, on the grid) and the
 * surface's direction.
 */
export interface ModelHit {
  placed: PlacedPart;
  point: Vec3;
  /** The surface's outward direction: a signed project axis. */
  normal: Vec3;
}

/** A board the form made that Join takes over: its name before and after. */
export interface TakenOver {
  from: string;
  to: string;
}

/**
 * What the Join tool suggests for two boards, shown until it is accepted or the tool changes: the
 * type of joint and whether the shop can cut it, or the reason there is none. The joint itself is
 * not kept; Accept asks the engine again for the boards as they are then.
 */
export interface Proposal {
  a: Id;
  b: Id;
  result:
    | ({
        ok: true;
        type: Joint["type"];
        description: string;
        /**
         * The boards Accept will take over from the form, so the panel can say so before it is
         * pressed.
         */
        taken: readonly TakenOver[];
      } & ToolNeed)
    | { ok: false; reason: string };
}

/**
 * The line of sight under the pointer, in scene inches (display only): where it starts and which
 * way it goes.
 */
export interface Ray {
  origin: readonly [number, number, number];
  dir: readonly [number, number, number];
}

/** A Move drag that has begun: where it started and the boards it carries. */
export interface MoveDrag {
  from: Vec3;
  /** The line of sight where the drag began; every later position is measured against it. */
  ray: Ray | null;
  placed: PlacedPart[];
  /** The last move and mode previewed; null for a click that has not been dragged. */
  last: string | null;
}

/**
 * A tool's half-finished action, waiting for its next click or typed size. It always belongs to
 * the tool that is active (`setPending` refuses any other).
 */
export type Pending =
  | { tool: "join"; first: Id }
  | { tool: "tape"; from: Vec3 }
  | { tool: "board"; from: { placed: PlacedPart | null; point: Vec3 } }
  | { tool: "pushPull"; hit: ModelHit; dragged: string | null; ray: Ray | null }
  | {
      tool: "move";
      /** The direction locked with an arrow key (x, y, z), or null to follow the largest. */
      axis: 0 | 1 | 2 | null;
      /** Absent while only the arrow lock is set and nothing is being dragged. */
      drag?: MoveDrag;
    };
