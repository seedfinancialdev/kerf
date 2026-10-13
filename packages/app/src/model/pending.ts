// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool has started and not finished. Kept apart from the store and the tool handlers so
// that both can name these types without importing each other.

import type { Id, JointProposal, PlacedPart, Vec3 } from "@kerf/core";

/** Where the pointer is on the model: the board, the point (project units, on the grid) and the surface's direction. */
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

/** What the Join tool suggests for two boards, shown until it is accepted or the tool changes. */
export interface Proposal {
  a: Id;
  b: Id;
  result: JointProposal;
  /** The boards Accept will take over from the form, so the panel can say so before it is pressed. */
  taken: readonly TakenOver[];
}

/** The line of sight under the pointer, in scene inches (display only): where it starts and which way it goes. */
export interface Ray {
  origin: readonly [number, number, number];
  dir: readonly [number, number, number];
}

/** A tool's half-finished action, waiting for its next click or typed size. */
export type Pending =
  | { tool: "join"; first: Id }
  | { tool: "tape"; from: Vec3 }
  | { tool: "board"; from: { placed: PlacedPart | null; point: Vec3 } }
  | { tool: "pushPull"; hit: ModelHit; dragged: string | null; ray: Ray | null }
  | {
      tool: "move";
      from: Vec3;
      /** The line of sight where the drag began; every later position is measured against it. */
      ray: Ray | null;
      placed: PlacedPart[];
      /** The direction locked with an arrow key (x, y, z), or null to follow the largest. */
      axis: 0 | 1 | 2 | null;
      /** The last move and mode previewed; null for a click that has not been dragged. */
      last: string | null;
    };
