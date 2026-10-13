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
import { newProblem } from "./new-problem";

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
});
