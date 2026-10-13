// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 6 (ruling R36): a tool's change is refused only for an error the project did not
// already have. The hand-made bookcase's right side holds the floor point (0, 0, 0).

import { type Id, type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { describe, expect, it } from "vitest";
import { setOption, startProject } from "../model/commands";
import { drawBoard } from "./board";
import { editNotice, newProblem } from "./edit-outcome";
import { moveBoards } from "./move";

const shop = loadShopProfile();
const IN = 203_200;
const clean = handMadeBookcase();
const stock: Id = clean.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";

/** `project` with a 24" × 6" board lying at `corner` (project units). */
const withBoard = (project: Project, corner: [number, number, number]): Project =>
  drawBoard(project, stock, corner, { axis: 0, size: 24 * IN }, { axis: 1, size: 6 * IN }).project;

const insideRightSide: [number, number, number] = [0, 0, 0];
const onTheFloorClear: [number, number, number] = [40 * IN, -4 * IN, 0];
const alsoInsideRightSide: [number, number, number] = [IN, IN, 0];

describe("newProblem()", () => {
  it("is null when the change brings no error", () => {
    expect(newProblem(clean, withBoard(clean, onTheFloorClear), shop)).toBeNull();
  });

  it("is null when the change brings only a warning", () => {
    // Shelves at two set heights with a count of 3: the engine warns that the count is ignored
    // (structures/openings.ts, "division-ignored"), which is a warning, not an error.
    const p = startProject("Blank case", "imperial").project;
    const structure = p.structures[0];
    const opening = structure?.openings[0];
    if (!structure || !opening) throw new Error("no opening");
    const warned: Project = {
      ...p,
      structures: [
        {
          ...structure,
          openings: [
            {
              ...opening,
              division: { type: "shelves", count: "3", spacing: ["12in", "24in"] },
            },
          ],
        },
      ],
    };
    const diagnostics = solve(warned, shop).diagnostics;
    expect(diagnostics.map((d) => [d.severity, d.rule])).toEqual([
      ["warning", "division-ignored"],
    ]);
    expect(newProblem(p, warned, shop)).toBeNull();
  });

  it("names the error a change brings, in the engine's words", () => {
    expect(newProblem(clean, withBoard(clean, insideRightSide), shop)).toMatch(
      /occupy the same space/,
    );
  });

  it("is null when the only error is one the project already had", () => {
    const already = withBoard(clean, insideRightSide);
    expect(newProblem(already, withBoard(already, onTheFloorClear), shop)).toBeNull();
  });

  it("still names a new error in a project that already has one", () => {
    const already = withBoard(clean, insideRightSide);
    const worse = withBoard(already, alsoInsideRightSide);
    expect(newProblem(already, worse, shop)).toMatch(/Board 2/);
  });

  it("names an error that comes again with the same words (silent-failure review M12)", () => {
    // A second copy of Board 1, 6" further back, still runs into the Right side (which is 12"
    // deep): the engine reports the same overlap twice, condensed into one line counted 2.
    const once = withBoard(clean, insideRightSide);
    const board = once.instances.at(-1);
    if (!board) throw new Error("no board");
    const copy = {
      ...board,
      id: "01K7M3Q8ZD000000000000ZZZZ",
      position: { ...board.position, y: "6in" },
    };
    const twice = { ...once, instances: [...once.instances, copy] };
    expect(newProblem(once, twice, shop)).toBe(
      "This part can't be built: Right side and Board 1 occupy the same space and are not joined.",
    );
  });

  it("does not count an error a board already had as new when a take-over renames it (re-review N4)", () => {
    // A 1" shelf roundover is too large for a 23/32" shelf, so every shelf already has an error.
    // Moving Shelf 2 up 1" takes it out of the row as "Shelf copy 2" and brings nothing new.
    const form = startProject("Bookcase", "imperial").project;
    const rounded = setOption(form, form.structures[0]?.id ?? "", "shelfRoundover", "1in").project;
    const shelf2 = solve(rounded, shop).placements.find((p) => p.name === "Shelf 2");
    if (!shelf2) throw new Error("no Shelf 2");
    const moved = moveBoards(rounded, [shelf2], [0, 0, IN], "move", shop);
    if (!moved.ok) throw new Error(moved.message);
    expect(newProblem(rounded, moved.edit.project, shop)).toBeNull();
    expect(editNotice(rounded, moved.edit.project, shop)).toBe(
      "Shelf 2 becomes Shelf copy 2, custom; the form won't change it.",
    );
  });
});
