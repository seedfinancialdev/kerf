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
import { editNotice, firstNewError, newProblem } from "./edit-outcome";
import { moveBoards } from "./move";
import { pushPull } from "./push-pull";

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
    expect(diagnostics.map((d) => [d.severity, d.rule])).toEqual([["warning", "division-ignored"]]);
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

describe("editNotice() names what the change caused (ruling R45; second-pass review I1, M4)", () => {
  const placedIn = (p: Project, name: string) => {
    const found = solve(p, shop).placements.find((x) => x.name === name);
    if (!found) throw new Error(`no ${name}`);
    return found;
  };

  it("names the board that moved and the one it now runs into", () => {
    // Board 1 lies 24" × 6" at x -30"..-6", 36" up, clear of the case. Moved 27" right it spans
    // x -3"..21" and runs into the Right side (x 0..23/32") and nothing else.
    const drawn = drawBoard(
      clean,
      stock,
      [-30 * IN, 2 * IN, 36 * IN],
      { axis: 0, size: 24 * IN },
      { axis: 1, size: 6 * IN },
    ).project;
    const board = placedIn(drawn, "Board 1");
    const moved = moveBoards(drawn, [board], [27 * IN, 0, 0], "move", shop);
    if (!moved.ok) throw new Error(moved.message);
    expect(editNotice(drawn, moved.edit.project, shop, [board.instance])).toBe(
      "Board 1 now overlaps Right side; Undo puts it back.",
    );
  });

  it("names the side that was edited, not the first copy of the board the two sides share", () => {
    // The sides are one board in two places with a 1/2" roundover on the front edge. Narrowing the
    // Left side to 1/4" leaves the roundover larger than the board: a problem of the board itself.
    const side = clean.parts.find((d) => d.name === "Side");
    if (!side) throw new Error("no side");
    const roundover = {
      id: "01K7M3Q8ZD00000000F3000A01",
      type: "roundover" as const,
      edges: ["edge1/face1" as const],
      radius: "1/2in",
    };
    const rounded = {
      ...clean,
      parts: clean.parts.map((d) => (d.id === side.id ? { ...d, ops: [roundover] } : d)),
    };
    const left = placedIn(rounded, "Left side");
    const narrowed = pushPull(rounded, left, "edge1", -(11 * IN + (3 * IN) / 4), shop);
    if (!narrowed.ok) throw new Error(narrowed.message);
    expect(editNotice(rounded, narrowed.edit.project, shop, [left.instance])).toBe(
      "Left side now has a problem (see Problems); Undo puts it back.",
    );
  });

  it("says a joint has a problem, without guessing why, for a dado deeper than its board", () => {
    // A 1" dado depth in 23/32" sides: the engine says the dado is as deep as the board is thick.
    const form = startProject("Bookcase", "imperial").project;
    const deep = setOption(form, form.structures[0]?.id ?? "", "dadoDepth", "1in").project;
    expect(editNotice(form, deep, shop)).toBe(
      "Shelf now has a problem with its dado in Right side (see Problems); Undo puts it back.",
    );
  });
});

describe("firstNewError() on a board a take-over renamed (second-pass review M4)", () => {
  // The template bookcase; Shelf 3 is taken out of its row as "Shelf copy 3" by a 1" move up.
  const form = startProject("Bookcase", "imperial").project;
  const was = solve(form, shop);
  const shelf = (n: number) => {
    const found = was.placements.find((p) => p.name === `Shelf ${n}`);
    if (!found) throw new Error(`no Shelf ${n}`);
    return found;
  };
  const moved = moveBoards(form, [shelf(3)], [0, 0, IN], "move", shop);
  if (!moved.ok) throw new Error(moved.message);
  const now = solve(moved.edit.project, shop);
  const copy = now.placements.find((p) => p.name === "Shelf copy 3");
  const back = now.placements.find((p) => p.name === "Back");
  if (!copy || !back) throw new Error("no copy or back");
  const renamed = [{ now: copy.instance, was: shelf(3).instance }];
  const overlap = (part: Id, pair: readonly [Id, Id], message: string) => ({
    severity: "error" as const,
    rule: "overlap" as const,
    message,
    part,
    instances: pair,
  });

  it("names a new overlap on the renamed copy although another shelf of its row already overlapped", () => {
    // Before: Shelf 1 runs into the Back, an error on the row's shared part.
    const before = overlap(shelf(1).part, [shelf(1).instance, back.instance], "Shelf 1 and Back …");
    // After: that error is still there, and the moved copy now runs into the Back too.
    const brought = overlap(copy.part, [copy.instance, back.instance], "Shelf copy 3 and Back …");
    const error = firstNewError(
      { ...was, diagnostics: [before] },
      { ...now, diagnostics: [before, brought] },
      renamed,
    );
    expect(error).toBe(brought);
  });

  it("does not report the copy's own earlier overlap again under its new name", () => {
    const before = overlap(shelf(3).part, [shelf(3).instance, back.instance], "Shelf 3 and Back …");
    const after = overlap(copy.part, [copy.instance, back.instance], "Shelf copy 3 and Back …");
    expect(
      firstNewError({ ...was, diagnostics: [before] }, { ...now, diagnostics: [after] }, renamed),
    ).toBeNull();
  });

  it("does not take a per-rule summary whose number fell for a new error (second-pass re-review, minor 1)", () => {
    // 30 problems of one rule: 25 listed and "5 more …" summed up. A change that removes one leaves
    // "4 more …": fewer problems, so nothing new.
    const summary = (n: number) => ({
      severity: "error" as const,
      rule: "overlap" as const,
      message: `${n} more problems like this one are not listed, such as: Top and Back …`,
      count: n,
      summary: true as const,
    });
    expect(
      firstNewError(
        { ...was, diagnostics: [summary(5)] },
        { ...now, diagnostics: [summary(4)] },
        renamed,
      ),
    ).toBeNull();
  });
});
