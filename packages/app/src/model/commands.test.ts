// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The edits the app makes. Expected numbers: Operation specs, "Golden test: bookcase" and its
// resize checks (shelves 35-1/16" cut at 36", 29-1/16" at 30"; 5 shelves → a line of 7).

import { generateStructures, type PlacedPart, type Project, solve } from "@kerf/core";
import { loadShopProfile, withParam } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import {
  acceptJoinery,
  addPartition,
  addRoundover,
  clearDivision,
  detachForEdit,
  handBack,
  instanceOf,
  setOption,
  setShelfRoundover,
  setShelves,
  setSize,
  splitBays,
  startProject,
  switchUnits,
  UNPLACEABLE,
} from "./commands";
import { STOCK_IDS } from "./starter";

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

  it("starts a metric bookcase on 18 mm plywood, solved with no errors", () => {
    const { project } = startProject("Bookcase", "metric");
    const result = solve(project, shop);
    expect(result.diagnostics).toEqual([]);
    expect(result.cutList.lines).toHaveLength(3);
    // 72" = 1828.8 mm = 14630400 units; the sides do not depend on the plywood's thickness.
    expect(result.cutList.lines.find((l) => l.parts.some((x) => x.name === "Side"))?.length).toBe(
      14_630_400,
    );
    expect(project.stock.map((x) => x.name)).toEqual([
      "18 mm plywood",
      "1/4 plywood",
      "4/4 walnut",
    ]);
  });

  it("starts the imperial bookcase with no diagnostics at all", () => {
    expect(solve(start().project, shop).diagnostics).toEqual([]);
  });

  it.each(["Bookcase", "Keepsake box", "Blank case", "Blank box"] as const)(
    "starts a metric %s that solves with no errors",
    (name) => {
      const { project } = startProject(name, "metric");
      expect(solve(project, shop).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    },
  );

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

  it("names the field as it is labelled, not by its parameter, when it refers to itself", () => {
    // The keepsake box's Length is the parameter box_length (core structures/templates.ts).
    const p = startProject("Keepsake box", "imperial").project;
    expect(setSize(p, structureOf(p).id, "w", 'box_length + 1"')).toEqual({
      ok: false,
      message: "Length can't be worked out from itself.",
    });
  });

  it.each(['0"', '-1"'])("refuses a width of %s: a size must be more than zero", (text) => {
    const p = start().project;
    expect(setSize(p, structureOf(p).id, "w", text)).toEqual({
      ok: false,
      message: "Width must be more than zero.",
    });
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

  it("labels a change from a saved count it cannot read by that count as saved: 'Shelves 65 → 4'", () => {
    // 65 is past the 64 a form makes (core structures/builder.ts, MAX_COUNT).
    const p = withParam(start().project, "shelf_count", "65");
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = setShelves(p, structureOf(p).id, opening, "4", "even");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Shelves 65 → 4");
  });

  it("labels shelves added to an empty opening 'Added 3 shelves'", () => {
    const p = startProject("Blank case", "imperial").project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = setShelves(p, structureOf(p).id, opening, "3", "even");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Added 3 shelves");
  });
});

describe("setShelves() at set heights", () => {
  it("puts each shelf's underside at the height typed, from the case's bottom", () => {
    // ADR 014, D9: a set height is the underside of a shelf measured from the case's bottom.
    // 12" = 2438400 and 24" = 4876800 units.
    const p = startProject("Blank case", "imperial").project;
    const opening = structureOf(p).openings[0]?.id ?? "";
    const r = setShelves(p, structureOf(p).id, opening, "2", ['12"', '24"']);
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Added 2 shelves");
    const undersides = solve(r.edit.project, shop)
      .placements.filter((x) => x.source?.role === "shelf")
      .map((x) => x.box.min[2])
      .sort((a, b) => a - b);
    expect(undersides).toEqual([12 * IN, 24 * IN]);
  });
});

describe("splitBays()", () => {
  const blank = () => {
    const p = startProject("Blank case", "imperial").project;
    return { p, structure: structureOf(p).id, opening: structureOf(p).openings[0]?.id ?? "" };
  };
  const partitions = (p: Project) =>
    solve(p, shop).placements.filter((x) => x.name.startsWith("Partition"));

  it("splits an empty case into 3 bays with 2 partitions", () => {
    // n bays need n - 1 partitions between them: 3 - 1 = 2 (as in structures.unit.test.ts).
    const { p, structure, opening } = blank();
    const r = splitBays(p, structure, opening, "3");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Split into 3 bays");
    expect(r.edit.project.structures[0]?.openings[0]?.children).toHaveLength(3);
    expect(partitions(r.edit.project)).toHaveLength(2);
  });

  it("accepts 2 bays, the fewest that divide an opening: 1 partition", () => {
    const { p, structure, opening } = blank();
    const r = splitBays(p, structure, opening, "2");
    if (!r.ok) throw new Error(r.message);
    expect(partitions(r.edit.project)).toHaveLength(1);
  });

  it("refuses 1 bay, which divides nothing", () => {
    const { p, structure, opening } = blank();
    expect(splitBays(p, structure, opening, "1")).toEqual({
      ok: false,
      message: "Bays need a number of 2 or more.",
    });
  });

  it("accepts 64 bays, the most a form makes (MAX_COUNT in core)", () => {
    const { p, structure, opening } = blank();
    const r = splitBays(p, structure, opening, "64");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.structures[0]?.openings[0]?.children).toHaveLength(64);
  });

  it("refuses 65 bays, one past the most, without building the openings", () => {
    const { p, structure, opening } = blank();
    expect(splitBays(p, structure, opening, "65")).toEqual({
      ok: false,
      message: "Type a whole number up to 64.",
    });
  });

  it("refuses a billion bays at once, rather than building a billion openings", () => {
    const { p, structure, opening } = blank();
    expect(splitBays(p, structure, opening, "1000000000")).toEqual({
      ok: false,
      message: "Type a whole number up to 64.",
    });
  });
});

describe("clearDivision()", () => {
  it("empties the bookcase's opening: no division, no sub-openings and no shelves", () => {
    const p = start().project;
    const edit = clearDivision(p, structureOf(p).id, structureOf(p).openings[0]?.id ?? "");
    expect(edit.label).toBe("Emptied the opening");
    expect(edit.project.structures[0]?.openings[0]).toEqual({
      id: structureOf(p).openings[0]?.id,
      children: [],
    });
    expect(shelfLine(edit.project)).toBeUndefined();
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
    expect(addPartition(p, structureOf(p).id, opening, "abc")).toEqual({
      ok: false,
      message: 'Unknown name "abc"',
    });
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
    const { project, label } = addRoundover(p, top, ["edge1/face0", "edge1/face1"], IN / 8, shop);
    expect(label).toBe('Roundover 1/8" on Top');
    const def = project.parts.find((d) => d.name === "Top");
    expect(def?.detached).toBe(true);
    expect(def?.ops).toMatchObject([
      { type: "roundover", edges: ["edge1/face0", "edge1/face1"], radius: "3.175mm" },
    ]);
  });
});

describe("switchUnits()", () => {
  it("switches a project whose stock fits the grid to millimetres, labelled", () => {
    // Only 1/4 plywood is used: 50800 = 635 × 80, so it is a whole number of 0.01 mm.
    const p = start().project;
    const onQuarter = setOption(p, structureOf(p).id, "carcaseStock", STOCK_IDS.plywood14);
    const r = switchUnits(onQuarter.project, "metric");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.units).toBe("metric");
    expect(r.edit.label).toBe("Units: millimetres");
  });

  it("keeps every size when switching to inches and back (ADR 015, rule 4)", () => {
    // Rule 4: "A project is never rounded to fit." The solve before the switch is the oracle: the
    // same cut list and the same board boxes after it, and after switching back. The metric box
    // uses only 1/4 plywood (50800 units) and 4/4 walnut (101600), which sit on both grids.
    const box = startProject("Keepsake box", "metric").project;
    const toInches = switchUnits(box, "imperial");
    if (!toInches.ok) throw new Error(toInches.message);
    const back = switchUnits(toInches.edit.project, "metric");
    if (!back.ok) throw new Error(back.message);
    const sizes = (p: Project) => {
      const r = solve(p, shop);
      return { cutList: r.cutList, boxes: r.placements.map((x) => [x.name, x.box]) };
    };
    const before = sizes(box);
    // Not vacuous: Operation specs, "Golden test: keepsake box", bottom check: 9 + 2 x 1/4 =
    // 9-1/2" and 5 + 2 x 1/4 = 5-1/2" (1930400 x 1117600).
    expect(before.cutList.lines.map((l) => [l.length, l.width])).toContainEqual([
      1_930_400, 1_117_600,
    ]);
    expect(before.boxes.length).toBeGreaterThan(0);
    expect(sizes(toInches.edit.project)).toEqual(before);
    expect(sizes(back.edit.project)).toEqual(before);
  });

  it("labels the switch back to inches", () => {
    const r = switchUnits(startProject("Keepsake box", "metric").project, "imperial");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Units: inches");
  });

  it("refuses millimetres when the 3/4 plywood is off the 0.01 mm grid, naming it", () => {
    // 23/32" = 146050 units; 146050 mod 80 = 50, so it is not a whole number of 0.01 mm.
    const r = switchUnits(start().project, "metric");
    expect(r).toEqual({
      ok: false,
      message:
        "This project stays in inches because its 3/4 plywood is 23/32\" thick, which isn't a whole number of 0.01 mm.",
    });
  });

  it("refuses inches when the 18 mm plywood is off the 1/64 inch grid", () => {
    // 144000 mod 3175 = 1125, so it is not a whole number of 1/64".
    const r = switchUnits(startProject("Bookcase", "metric").project, "imperial");
    expect(r).toEqual({
      ok: false,
      message:
        "This project stays in millimetres because its 18 mm plywood is 18.0 mm thick, which isn't a whole number of 1/64\".",
    });
  });
});

const placementNamed = (p: Project, name: string): PlacedPart => {
  const found = solve(p, shop).placements.find((x) => x.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const shelfMember = (p: Project, index: number): PlacedPart => {
  const found = solve(p, shop).placements.find(
    (x) => x.source?.role === "shelf" && x.pattern?.index === index,
  );
  if (!found) throw new Error(`no shelf ${index}`);
  return found;
};

describe("detachForEdit()", () => {
  it("takes over a whole board: only that part is kept, its place stays, the cut list is the same", () => {
    const p = start().project;
    const top = placementNamed(p, "Top");
    const r = detachForEdit(p, top, shop);
    expect(r.detached).toBe(true);
    expect(r.project.parts.map((d) => d.name)).toEqual(["Top"]);
    expect(r.project.instances.some((i) => i.def === top.part)).toBe(true);
    // Same lines and quantities; only the engine's ordering of the lines may differ.
    const byLength = (q: Project) =>
      [...solve(q, shop).cutList.lines].sort(
        (a, b) => a.length - b.length || a.quantity - b.quantity,
      );
    expect(byLength(r.project)).toEqual(byLength(p));
  });

  it("takes one shelf out of the row: three stay put, the copy is a board of its own", () => {
    const p = start().project;
    const before = solve(p, shop).placements.filter((x) => x.source?.role === "shelf");
    const r = detachForEdit(p, shelfMember(p, 1), shop);
    expect(r.detached).toBe(true);
    const after = solve(r.project, shop).placements;
    const row = after.filter((x) => x.source?.role === "shelf" && x.pattern);
    expect(row).toHaveLength(3);
    for (const member of row) {
      const was = before.find((b) => b.pattern?.index === member.pattern?.index);
      expect(member.box).toEqual(was?.box);
    }
    const copy = after.find((x) => x.name === "Shelf copy 2");
    expect(copy?.box).toEqual(before[1]?.box);
    // Boards of one stock and size share a cut-list line (golden: Top, Bottom and Shelf are one
    // line of 6), so the detached shelf does not split the line: it stays at 6.
    const line = solve(r.project, shop).cutList.lines.find((l) =>
      l.parts.some((x) => x.name === "Shelf"),
    );
    expect(line?.quantity).toBe(6);
    // Generating again keeps the skip: the row is still three.
    const again = generateStructures(r.project, shop);
    expect(again.patterns.some((x) => x.skip?.includes(1))).toBe(true);
  });

  it("does nothing to a board that is already detached", () => {
    const p = start().project;
    const once = detachForEdit(p, placementNamed(p, "Top"), shop).project;
    const r = detachForEdit(once, placementNamed(once, "Top"), shop);
    expect(r).toEqual({ project: once, detached: false });
  });

  it("says the boards cannot be placed when the engine rejects the project, and why that matters", () => {
    const p = start().project;
    const top = placementNamed(p, "Top");
    // A stock thinner than nothing is not a project the engine accepts (Domain model, "Stock").
    const [first, ...others] = p.stock;
    const broken = { ...p, stock: [{ ...first, thickness: -1 }, ...others] } as Project;
    expect(() => detachForEdit(broken, top, shop)).toThrow(
      expect.objectContaining({ name: "TakeOverError", message: UNPLACEABLE }),
    );
  });

  it("does nothing to a board made by hand", () => {
    const p = startProject("Blank case", "imperial").project;
    const hand: PlacedPart = { ...placementNamed(p, "Top"), source: undefined };
    expect(detachForEdit(p, hand, shop)).toEqual({ project: p, detached: false });
  });
});

describe("instanceOf()", () => {
  it("finds the copy taken out of a row by its place in the row", () => {
    const p = start().project;
    const member = shelfMember(p, 1);
    const { project } = detachForEdit(p, member, shop);
    const found = instanceOf(project, member);
    expect(found?.detachedFrom).toMatchObject({ pattern: member.pattern?.id, index: 1 });
  });

  it("finds a whole board by its instance id", () => {
    const p = start().project;
    const top = placementNamed(p, "Top");
    const { project } = detachForEdit(p, top, shop);
    expect(instanceOf(project, top)?.id).toBe(top.instance);
  });
});

describe("addRoundover() on a member of a row", () => {
  it("puts the roundover on the detached copy, which is the only generated part saved", () => {
    const p = start().project;
    const member = shelfMember(p, 1);
    const { project } = addRoundover(p, member, ["edge1/face0"], IN / 8, shop);
    const copy = project.instances.find((i) => i.detachedFrom?.index === 1);
    const def = project.parts.find((d) => d.id === copy?.def);
    // The form already rounds a shelf's edges; the new roundover is added after that one.
    expect(def?.ops).toHaveLength(2);
    expect(def?.ops.at(-1)).toMatchObject({
      type: "roundover",
      edges: ["edge1/face0"],
      radius: "3.175mm",
    });
    expect(project.parts.filter((d) => d.source !== undefined)).toEqual([def]);
    const solved = solve(project, shop).placements;
    expect(solved.filter((x) => x.source?.role === "shelf" && x.pattern)).toHaveLength(3);
    expect(solved.find((x) => x.name === "Shelf copy 2")?.box).toEqual(member.box);
  });
});

describe("a missing opening", () => {
  const p = startProject("Blank case", "imperial").project;
  const id = structureOf(p).id;

  it.each([
    ["setShelves", () => setShelves(p, id, "nope", "3", "even")],
    ["addPartition", () => addPartition(p, id, "nope", "1/3")],
    ["splitBays", () => splitBays(p, id, "nope", "3")],
    ["clearDivision", () => clearDivision(p, id, "nope")],
  ])("%s throws a RangeError", (_name, run) => {
    expect(run).toThrow(RangeError);
  });
});

describe("handBack()", () => {
  const handed = (project: Project, placed: PlacedPart) => {
    const r = handBack(project, placed, shop);
    if (!r.ok) throw new Error(r.message);
    return r.edit;
  };

  it("returns a taken-over board to the form", () => {
    const p = start().project;
    const taken = addRoundover(p, placementNamed(p, "Top"), ["edge1/face1"], IN / 8, shop).project;
    const { project, label } = handed(taken, placementNamed(taken, "Top"));
    expect(label).toBe("Top follows the form again");
    expect(project.parts).toEqual([]);
  });

  it("puts a shelf taken out of its row back in the row", () => {
    const p = start().project;
    const taken = detachForEdit(p, shelfMember(p, 1), shop).project;
    const own = solve(taken, shop).placements.find((x) => x.source?.role === "shelf" && x.detached);
    if (!own) throw new Error("no detached shelf");
    const { project } = handed(taken, own);
    expect(project.instances).toEqual([]);
    expect(solve(project, shop).placements.filter((x) => x.source?.role === "shelf")).toHaveLength(
      4,
    );
  });

  it("says what to remove first when a joint you added names the board", () => {
    const p = start().project;
    const sample = generateStructures(p, shop).joints[0];
    if (!sample) throw new Error("no joint");
    const both = addRoundover(
      detachForEdit(p, shelfMember(p, 1), shop).project,
      placementNamed(p, "Top"),
      ["edge1/face1"],
      IN / 8,
      shop,
    ).project;
    const own = solve(both, shop).placements.find((x) => x.source?.role === "shelf" && x.detached);
    const top = solve(both, shop).placements.find((x) => x.name === "Top");
    if (!own || !top) throw new Error("no detached boards");
    const { generatedBy: _, ...byHand } = {
      ...sample,
      id: "01K7M3Q8ZD00000000H0000001",
      host: top.instance,
      guest: own.instance,
    };
    const r = handBack({ ...both, joints: [...both.joints, byHand] }, own, shop);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/remove that first/);
  });
});
