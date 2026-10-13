// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "The build plan", item 6; wording from ADR 015, rule 5.

import { assemblyOrder, type Project } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const texts = (project: Project): string[] => assemblyOrder(project, shop).map((s) => s.text);

describe("assemblyOrder()", () => {
  it("gives the bookcase's four steps: dry-fit, glue, square, back last", () => {
    expect(texts(loadProject("bookcase", "structure"))).toEqual([
      "Dry-fit the case without glue and check that every joint closes.",
      "Glue Top, Bottom and 4 × Shelf into the sides.",
      "Square the case: the two diagonals must match. Adjust before the glue sets.",
      "Fit the Back last.",
    ]);
  });

  it("leaves out the back step for a case with no back", () => {
    const project = structuredClone(loadProject("bookcase", "structure"));
    const s = project.structures[0];
    if (!s) throw new Error("no structure");
    s.options.back = "none";
    delete s.options.backStock;
    expect(texts(project)).toHaveLength(3);
  });

  it("gives the box's three steps with the bottom loose in its groove", () => {
    expect(texts(loadProject("box", "structure"))).toEqual([
      "Dry-fit the box without glue and check that every corner closes.",
      "Glue the corners with the Bottom in its groove, not glued, so it can move.",
      "Square the box: the two diagonals must match. Adjust before the glue sets.",
    ]);
  });

  it("gives no steps for a project with no form", () => {
    expect(texts(loadProject("bookcase"))).toEqual([]);
  });

  it("names the four shelves among the boards the glue step uses", () => {
    const glue = assemblyOrder(loadProject("bookcase", "structure"), shop)[1];
    // Top + Bottom + 4 shelves + 2 sides = 8 placed boards.
    expect(glue?.parts).toHaveLength(8);
  });
});
