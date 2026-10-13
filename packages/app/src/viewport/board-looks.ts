// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// How each placed board is drawn (ADR 015, rules 8 and 10; Interaction spec, "Feedback & errors").
// An error withholds the shapes, so those boards are drawn as plain blanks, still in place; a board
// the engine names in an error is red whatever its stock.

import type { PartShape, PlacedPart, Project, SolveResult } from "@kerf/core";

/** The colour a board takes: its stock's wood, or the error colour. */
export type Tone = "sheet" | "solid" | "error";

export type BoardLook = { placed: PlacedPart; tone: Tone } & (
  | { geometry: "cut"; shape: PartShape }
  | { geometry: "blank" }
);

/** One look per placed board, in the engine's order. */
export function boardLooks(result: SolveResult, project: Project): BoardLook[] {
  const shapes = new Map(result.shapes.map((s) => [s.definition, s]));
  const failing = new Set(
    result.diagnostics.flatMap((d) => (d.severity === "error" && d.part ? [d.part] : [])),
  );
  return result.placements.map((placed) => {
    const wood =
      project.stock.find((s) => s.id === placed.stock)?.kind === "sheet" ? "sheet" : "solid";
    const tone = failing.has(placed.part) ? "error" : wood;
    const shape = shapes.get(placed.shape);
    return shape ? { placed, tone, geometry: "cut", shape } : { placed, tone, geometry: "blank" };
  });
}
