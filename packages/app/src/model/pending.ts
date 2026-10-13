// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool has started and not finished. Kept apart from the store and the tool handlers so
// that both can name these types without importing each other.

import type { Id, PlacedPart, Vec3 } from "@kerf/core";

/** Where the pointer is on the model: the board, the point (project units, on the grid) and the surface's direction. */
export interface ModelHit {
  placed: PlacedPart;
  point: Vec3;
  /** The surface's outward direction: a signed project axis. */
  normal: Vec3;
}

/** A tool's half-finished action, waiting for its next click or typed size. */
export type Pending =
  | { tool: "join"; first: Id }
  | { tool: "tape"; from: Vec3 }
  | { tool: "board"; from: ModelHit }
  | { tool: "pushPull"; hit: ModelHit; dragged: string | null }
  | {
      tool: "move";
      from: Vec3;
      placed: PlacedPart[];
      /** The direction locked with an arrow key (x, y, z), or null to follow the largest. */
      axis: 0 | 1 | 2 | null;
      /** The last move and mode previewed; null for a click that has not been dragged. */
      last: string | null;
    };
