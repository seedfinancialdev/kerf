// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the user has picked (Interaction spec, "Select": parts, openings). Boards are placed copies
// (`PlacedPart.instance`), so one shelf of a row can be picked on its own.

import type { Id } from "@kerf/core";

/** What is picked: nothing, a whole form, one opening of it, or boards. */
export type Selection =
  | { kind: "none" }
  | { kind: "structure"; structure: Id }
  | { kind: "opening"; structure: Id; opening: Id }
  | { kind: "boards"; instances: Id[] };

/** The empty pick. */
export const NOTHING: Selection = { kind: "none" };
