// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 6 (ruling R36): a tool's change is refused only for an error the project did not
// already have. The hand-made bookcase's right side holds the floor point (0, 0, 0).

import type { Id, Project } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { describe, expect, it } from "vitest";
import { drawBoard } from "./board";
import { newProblem } from "./edit-outcome";

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
});
