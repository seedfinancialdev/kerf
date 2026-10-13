// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Project tree (left)": "structures, their openings, then parts with counts.
// Errors show as badges."

import { type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { treeRows } from "./tree";

const shop = loadShopProfile();
const rowsOf = (p: Project) => treeRows(p, solve(p, shop));

describe("treeRows()", () => {
  it("lists the bookcase, its opening with 4 shelves, then its boards with counts", () => {
    const rows = rowsOf(startProject("Bookcase", "imperial").project);
    expect(rows.map((r) => [r.kind, r.label, r.kind === "group" ? r.count : null])).toEqual([
      ["structure", "Bookcase", null],
      ["opening", "Opening · 4 shelves", null],
      ["group", "Side", 2],
      ["group", "Top", 1],
      ["group", "Bottom", 1],
      ["group", "Shelf", 4],
      ["group", "Back", 1],
    ]);
  });

  it("gives each board group the test id the end-to-end test uses", () => {
    const rows = rowsOf(startProject("Bookcase", "imperial").project);
    expect(rows.flatMap((r) => (r.kind === "group" ? [r.testId] : []))).toContain(
      "part-group-shelves",
    );
  });

  it("badges the boards an error is about", () => {
    const p = startProject("Bookcase", "imperial").project;
    const s = p.structures[0];
    if (!s) throw new Error("no structure");
    s.options.dadoDepth = "23/32in";
    const shelves = rowsOf(p).find((r) => r.label === "Shelf" || r.label === "Side");
    expect(shelves?.problems).toBeGreaterThan(0);
  });

  it("says an empty opening is empty", () => {
    const rows = rowsOf(startProject("Blank case", "imperial").project);
    expect(rows.find((r) => r.kind === "opening")?.label).toBe("Opening · empty");
  });
});
