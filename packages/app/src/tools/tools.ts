// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The escape-hatch tools (Interaction spec, "3D tools" table) and their SketchUp keys.

import type { ToolId } from "../model/store-types";

/** The tool row, in order, with the key that picks each. */
export const TOOLS: ReadonlyArray<{ id: ToolId; label: string; key: string }> = [
  { id: "select", label: "Select", key: "Space" },
  { id: "board", label: "Board", key: "B" },
  { id: "pushPull", label: "Push/Pull", key: "P" },
  { id: "move", label: "Move", key: "M" },
  { id: "join", label: "Join", key: "J" },
  { id: "edge", label: "Edge profile", key: "F" },
  { id: "tape", label: "Tape", key: "T" },
];

/** The tool a key picks. R is Board too (SketchUp's rectangle); E is left unassigned on purpose. */
export function toolForKey(key: string): ToolId | undefined {
  if (key === " ") return "select";
  const k = key.toLowerCase();
  if (k === "r") return "board";
  return TOOLS.find((t) => t.key.toLowerCase() === k && t.key !== "Space")?.id;
}
