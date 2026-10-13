// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The edits the app makes. Expected numbers: Operation specs, "Golden test: bookcase" and its
// resize checks (shelves 35-1/16" cut at 36", 29-1/16" at 30"; 5 shelves → a line of 7).

import { type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import {
  acceptJoinery,
  addPartition,
  addRoundover,
  setOption,
  setShelfRoundover,
  setShelves,
  setSize,
  setUnits,
  startProject,
} from "./commands";

const shop = loadShopProfile();
const IN = 203_200;
const start = () => startProject("Bookcase", "imperial");
const structureOf = (p: Project) => {
  const s = p.structures[0];
  if (!s) throw new Error("no structure");
  return s;
};
const shelfLine = (p: Project) =>
  solve(p, shop).cutList.lines.find((l) => l.parts.some((x) => x.name === "Shelf"));

describe("startProject()", () => {
  it("starts the bookcase with the golden cut list: 3 lines, shelves 35-1/16 cut", () => {
    const { project, label } = start();
    expect(label).toBe("New bookcase");
    const lines = solve(project, shop).cutList.lines;
    expect(lines).toHaveLength(3);
    // 36 − 2 × 23/32 + 2 × 1/4 = 35-1/16" = 7124700.
    expect(shelfLine(project)?.length).toBe(7_124_700);
  });

  it("copies the starter stock into the project", () => {
    expect(start().project.stock.map((s) => s.name)).toEqual([
      "3/4 plywood",
      "1/4 plywood",
      "4/4 walnut",
    ]);
  });
});

describe("setSize()", () => {
  it('resizes to 30": shelves 29-1/16 cut, labelled Width 36" → 30"', () => {
    const p = start().project;
    const r = setSize(p, structureOf(p).id, "w", '30"');
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe('Width 36" → 30"');
    // 30 − 2 × 23/32 + 2 × 1/4 = 29-1/16" = 5905500.
    expect(shelfLine(r.edit.project)?.length).toBe(5_905_500);
  });

  it("edits the width parameter, not the form, when the form names it", () => {
    const p = start().project;
    const r = setSize(p, structureOf(p).id, "w", '30"');
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.params.find((x) => x.name === "width")?.expr).toBe('30"');
    expect(structureOf(r.edit.project).size.w).toBe("width");
  });

  it("refuses a width worked out from itself and leaves the project alone", () => {
    const p = start().project;
    const before = JSON.stringify(p);
    expect(setSize(p, structureOf(p).id, "w", 'width + 1"')).toEqual({
      ok: false,
      message: "Width can't be worked out from itself.",
    });
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("setShelves()", () => {
  it("makes the shelves line 7 long with 5 shelves", () => {
    const p = start().project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = setShelves(p, structureOf(p).id, opening, "5", "even");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Shelves 4 → 5");
    expect(shelfLine(r.edit.project)?.quantity).toBe(7);
  });

  it("labels shelves added to an empty opening 'Added 3 shelves'", () => {
    const p = startProject("Blank case", "imperial").project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = setShelves(p, structureOf(p).id, opening, "3", "even");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Added 3 shelves");
  });
});

describe("addPartition()", () => {
  it("labels a partition at a third and the solve has a board named Partition", () => {
    const p = startProject("Blank case", "imperial").project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = addPartition(p, structureOf(p).id, opening, "1/3");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Added a partition at 1/3");
    expect(solve(r.edit.project, shop).placements.some((x) => x.name === "Partition")).toBe(true);
  });

  it("refuses text that is not a place", () => {
    const p = startProject("Blank case", "imperial").project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    expect(addPartition(p, structureOf(p).id, opening, "abc").ok).toBe(false);
  });
});

describe("setOption()", () => {
  it("labels a choice in shop words", () => {
    const p = start().project;
    expect(setOption(p, structureOf(p).id, "back", "none").label).toBe("Back: none");
  });

  it("labels a stock choice by the stock's name", () => {
    const p = start().project;
    const ply14 = p.stock[1]?.id ?? "";
    expect(setOption(p, structureOf(p).id, "carcaseStock", ply14).label).toBe(
      "Carcase stock: 1/4 plywood",
    );
  });
});

describe("acceptJoinery()", () => {
  it("marks every form's joinery reviewed, changing no board", () => {
    const p = start().project;
    const { project, label } = acceptJoinery(p);
    expect(label).toBe("Accepted the joinery");
    expect(structureOf(project).options.joineryReviewed).toBe(true);
    expect(solve(project, shop).cutList).toEqual(solve(p, shop).cutList);
  });
});

describe("setShelfRoundover()", () => {
  it("writes the radius exactly and keeps the shelves on the form", () => {
    const p = start().project;
    const { project, label } = setShelfRoundover(p, structureOf(p).id, IN / 8);
    expect(label).toBe('Shelf roundover 1/8"');
    expect(structureOf(project).options.shelfRoundover).toBe("3.175mm");
    expect(project.parts).toEqual([]);
  });

  it("removes the roundover with null", () => {
    const p = start().project;
    expect(setShelfRoundover(p, structureOf(p).id, null).label).toBe("No shelf roundover");
  });
});

describe("addRoundover()", () => {
  it("takes over a board the form made, then rounds both its front edges", () => {
    const p = start().project;
    const top = solve(p, shop).placements.find((x) => x.name === "Top");
    if (!top) throw new Error("no top");
    const { project, label } = addRoundover(p, top, ["edge1/face0", "edge1/face1"], IN / 8);
    expect(label).toBe('Roundover 1/8" on Top');
    const def = project.parts.find((d) => d.name === "Top");
    expect(def?.detached).toBe(true);
    expect(def?.ops).toMatchObject([
      { type: "roundover", edges: ["edge1/face0", "edge1/face1"], radius: "3.175mm" },
    ]);
  });
});

describe("setUnits()", () => {
  it("switches the project to millimetres, labelled", () => {
    const { project, label } = setUnits(start().project, "metric");
    expect(project.units).toBe("metric");
    expect(label).toBe("Units: millimetres");
  });
});
