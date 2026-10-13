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
import { boardLooks } from "./board-looks";

const shop = loadShopProfile();

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
    expect(looks.length).toBe(result.placements.length);
    expect(looks.every((l) => l.geometry === "blank")).toBe(true);
    const failing = new Set(
      result.diagnostics.flatMap((d) => (d.severity === "error" && d.part ? [d.part] : [])),
    );
    expect(failing.size).toBeGreaterThan(0);
    for (const l of looks) expect(l.tone === "error").toBe(failing.has(l.placed.part));
  });
});
