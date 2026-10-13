// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The hand-made bookcase with one loose shelf, for tests of the Join tool.

import type { Project } from "@kerf/core";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { drawBoard } from "../tools/board";

const IN = 203_200;

/**
 * The hand-made bookcase (sides 23/32" thick) with "Board 1": a 3/4" plywood shelf 34-9/16" long
 * between the sides' inside faces (x 23/32" to 35-9/32"), 11" deep, lying at 36" high.
 */
export function bookcaseWithShelf(): Project {
  const p = handMadeBookcase();
  const ply = p.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";
  return drawBoard(
    p,
    ply,
    [146_050, IN / 4, 36 * IN],
    { axis: 0, size: 7_023_100 },
    { axis: 1, size: 11 * IN },
  ).project;
}
