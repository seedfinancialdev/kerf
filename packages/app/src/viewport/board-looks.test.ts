// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// How each board is drawn (ADR 015, rules 8 and 10; Interaction spec, "Feedback & errors": a board
// with an error is red). An error withholds the shapes, so every board is then a plain blank, still
// in its place and still red where it is the one at fault.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { setOption, startProject } from "../model/commands";
import { drawBoard } from "../tools/board";
import { boardLooks } from "./board-looks";

const shop = loadShopProfile();
const IN = 203_200;

describe("boardLooks()", () => {
  it("draws every board of a sound bookcase with its cuts and none red", () => {
    const { project } = startProject("Bookcase", "imperial");
    const looks = boardLooks(solve(project, shop), project);
    // 2 sides + top + bottom + 4 shelves + back = 9 boards (the cut list's 2, 6 and 1).
    expect(looks).toHaveLength(9);
    expect(looks.every((l) => l.geometry === "cut" && l.tone !== "error")).toBe(true);
  });

  it("draws a blocked bookcase as blanks, with the boards at fault red, and does not throw", () => {
    const start = startProject("Bookcase", "imperial").project;
    const structure = start.structures[0]?.id ?? "";
    // A dado as deep as the 23/32" side leaves no wall: an error that blocks the solve.
    const project = setOption(start, structure, "dadoDepth", "23/32in").project;
    const result = solve(project, shop);
    expect(result.blocked).toBe(true);
    expect(result.shapes).toEqual([]);
    const looks = boardLooks(result, project);
    // Still all 9 boards, each a blank. The dado errors are on the Side part (one per side's
    // dado joint), so the two sides, and only they, are red.
    expect(looks).toHaveLength(9);
    expect(looks.every((l) => l.geometry === "blank")).toBe(true);
    const red = looks.filter((l) => l.tone === "error").map((l) => l.placed.name);
    // Each dado error names the shelf in the dado and the side holding it (Diagnostic.instances),
    // so the four shelves and the two sides are red; the top and bottom sit in rabbets, and the
    // back in its own rabbets (Operation specs, "Golden test: bookcase"), so they are not.
    expect(red.sort()).toEqual([
      "Left side",
      "Right side",
      "Shelf 1",
      "Shelf 2",
      "Shelf 3",
      "Shelf 4",
    ]);
  });

  it("reds only the two boards in one space, not every copy of a shelf's row (PR review types-M1)", () => {
    // A 6" × 6" board drawn from Shelf 2's corner lies inside Shelf 2: the overlap names those two.
    const { project } = startProject("Bookcase", "imperial");
    const shelf = solve(project, shop).placements.find((p) => p.name === "Shelf 2");
    const ply = project.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";
    if (!shelf) throw new Error("no Shelf 2");
    const inShelf = drawBoard(
      project,
      ply,
      shelf.box.min,
      { axis: 0, size: 6 * IN },
      { axis: 1, size: 6 * IN },
    ).project;
    const red = boardLooks(solve(inShelf, shop), inShelf)
      .filter((l) => l.tone === "error")
      .map((l) => l.placed.name);
    expect(red.sort()).toEqual(["Board 1", "Shelf 2"]);
  });
});
