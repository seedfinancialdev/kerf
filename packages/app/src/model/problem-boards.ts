// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Which placed boards an engine problem is about (Interaction spec, "Feedback & errors": the board
// with the problem is the one shown). One rule for the 3D view's colouring and the tools' notices,
// so a board is red exactly when a tool would name it.

import type { Diagnostic, Id, PlacedPart } from "@kerf/core";

/**
 * The boards `problem` is about, by instance id: those it names (`instances`: two boards in one
 * space, or a joint's guest and host), else every copy of its board (`part`), else none.
 */
export function boardsOf(problem: Diagnostic, placements: readonly PlacedPart[]): Id[] {
  if (problem.instances) return [...problem.instances];
  return placements.filter((p) => p.part === problem.part).map((p) => p.instance);
}
