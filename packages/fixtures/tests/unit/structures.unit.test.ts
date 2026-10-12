// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Structure generators (Domain model v0, "Structures, openings & shop profile"; Interaction spec,
// "Shape" and "Divide"). Expected values are hand calculations written beside each case; lengths
// are in 1/64ths of an inch where a case says so.

import {
  attachPartIn,
  buildCutList,
  detachPartIn,
  generateStructures,
  INCH,
  type Project,
  parseProject,
  projectFromTemplate,
  serializeProject,
  solve,
  TEMPLATES,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadExpected, loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const form = (): Project => loadProject("bookcase", "structure");
const box = (): Project => loadProject("box", "structure");
const sixtyFourths = (n: number): number => (n * INCH) / 64;
const rules = (p: Project): string[] =>
  solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);

describe("generateStructures()", () => {
  it("gives the same project, ids included, every time, and again when run on its own output", () => {
    const once = generateStructures(form(), shop);
    expect(generateStructures(form(), shop)).toEqual(once);
    expect(generateStructures(once, shop)).toEqual(once);
  });

  it("makes the bookcase's boards in the part list's order, each carrying its source", () => {
    const made = generateStructures(form(), shop);
    expect(made.parts.map((p) => [p.name, p.source?.role])).toEqual([
      ["Side", "side"],
      ["Top", "top"],
      ["Bottom", "bottom"],
      ["Shelf", "shelf"],
      ["Back", "back"],
    ]);
    expect(made.instances.map((i) => i.name)).toEqual([
      "Right side",
      "Left side",
      "Top",
      "Bottom",
      "Shelf",
      "Back",
    ]);
    expect(made.joints.map((j) => j.type)).toEqual([
      "dado",
      "dado",
      "rabbet",
      "rabbet",
      "rabbet",
      "rabbet",
      "rabbet",
      "rabbet",
    ]);
  });

  it("builds a project that solves with no errors or warnings", () => {
    expect(rules(form())).toEqual([]);
    // The box's groove is outside the half-pin on each wall (Operation specs, keepsake box).
    expect([...new Set(rules(box()))]).toEqual(["warning:groove-outside-bottom-half-pin"]);
  });

  it("keeps its ids stable across releases: pinned values from FNV-1a, computed independently", () => {
    // Saved detached boards refer to these ids, so changing how they are made would orphan them.
    const made = generateStructures(form(), shop);
    expect(made.parts[0]?.id).toBe("01K7M3Q8ZD000000HVZ94KAS8Y");
    expect(made.instances[0]?.id).toBe("01K7M3Q8ZD00000024DR6WCDHG");
  });

  it("has the same ids for the same structure whatever else is in the project", () => {
    const base = generateStructures(form(), shop);
    const wider = generateStructures(withParam(form(), "width", "40in"), shop);
    expect(wider.parts.map((p) => p.id)).toEqual(base.parts.map((p) => p.id));
    expect(new Set(base.instances.map((i) => i.id)).size).toBe(base.instances.length);
  });
});

describe("resizing a structure", () => {
  it("30in wide: shelves 29-1/16in cut, dado still 1/4in (spec, Resize)", () => {
    // 30 - 2 x 23/32 = 28-9/16 visible; + 2 x 1/4 dado = 29-1/16 cut.
    const line = buildCutList(withParam(form(), "width", "30in")).lines.find((l) =>
      l.parts.some((p) => p.name === "Shelf"),
    );
    expect(line?.length).toBe(sixtyFourths(29 * 64 + 4));
    expect(line?.visible.length).toBe(sixtyFourths(28 * 64 + 36));
  });

  it("5 shelves: the merged line holds top, bottom and 5 shelves", () => {
    const line = buildCutList(withParam(form(), "shelf_count", "5")).lines.find((l) =>
      l.parts.some((p) => p.name === "Shelf"),
    );
    expect(line?.quantity).toBe(7);
  });
});

describe("a case form without depths", () => {
  it("uses the spec's default rules: a third of the board for a dado, half for a rabbet", () => {
    const base = form();
    const structure = base.structures[0];
    const options = { ...structure?.options };
    for (const key of ["dadoDepth", "rabbetDepth", "backRabbetDepth"]) delete options[key];
    const blank: Project = {
      ...base,
      structures: base.structures.map((s) => ({ ...s, options })),
    };
    // 23/32 plywood: dado depth 23/96 snaps down to 15/64; rabbet depth 23/64 snaps down to 11/32.
    const shelfLine = buildCutList(blank).lines.find((l) =>
      l.parts.some((p) => p.name === "Shelf"),
    );
    const length = (name: string): number | undefined =>
      buildCutList(blank).lines.find((l) => l.parts.some((p) => p.name === name))?.length;
    // Top and bottom sit in rabbets 23/64 deep: 34-9/16 + 2 x 23/64 = 35-9/32 = 2258/64.
    // Shelves sit in dados 15/64 deep: 34-9/16 + 2 x 15/64 = 35-1/32 = 2242/64.
    expect(length("Top")).toBe(sixtyFourths(2258));
    expect(length("Shelf")).toBe(sixtyFourths(2242));
    expect(shelfLine).toBeDefined();
  });
});

describe("divisions of an opening", () => {
  const partitioned = (): Project => {
    const base = form();
    const structure = base.structures[0];
    if (!structure) throw new Error("no structure");
    const opening = structure.openings[0];
    if (!opening) throw new Error("no opening");
    const child = (n: number, count: string) => ({
      id: `01K7M3Q8ZD00000000B100007${n}`,
      division: { type: "shelves" as const, count, spacing: "even" as const },
      children: [],
    });
    return {
      ...base,
      structures: [
        {
          ...structure,
          openings: [
            {
              id: opening.id,
              division: { type: "partition", at: "12in" },
              children: [child(0, "2"), child(1, "2")],
            },
          ],
        },
      ],
    };
  };

  it("a partition at 12in: 2 boards between top and bottom, each side with its own shelves", () => {
    const made = generateStructures(partitioned(), shop);
    expect(made.parts.map((p) => p.name)).toEqual([
      "Side",
      "Top",
      "Bottom",
      "Partition",
      "Shelf 1",
      "Shelf 2",
      "Back",
    ]);
    expect(rules(partitioned())).toEqual([]);
  });

  it("sizes the partition and the shelves beside it from the interior, by hand", () => {
    // Interior 36 - 2 x 23/32 = 34-9/16. Partition: 72 - 2 x 23/32 = 70-9/16 visible, +2 x 1/4 in
    // the top and bottom dados = 71-1/16 cut. Left shelves: 12 visible (the partition's left face is
    // 12 in from the side), 12-1/2 cut. Right shelves: 34-9/16 - 12 - 23/32 = 21-27/32 visible,
    // 22-11/32 cut.
    const lines = buildCutList(partitioned()).lines;
    const lengths = lines.flatMap((l) => l.parts.map((p) => [p.name, l.length] as const));
    const of = (name: string): number | undefined => lengths.find(([n]) => n === name)?.[1];
    expect(of("Partition")).toBe(sixtyFourths(71 * 64 + 4));
    expect(of("Shelf 1")).toBe(sixtyFourths(12 * 64 + 32));
    expect(of("Shelf 2")).toBe(sixtyFourths(22 * 64 + 22));
  });

  it("splits into bays: 3 bays make 2 partitions", () => {
    const base = form();
    const structure = base.structures[0];
    const opening = structure?.openings[0];
    if (!structure || !opening) throw new Error("form has no opening");
    const withBays: Project = {
      ...base,
      structures: [
        {
          ...structure,
          openings: [{ id: opening.id, division: { type: "bays", count: "3" }, children: [] }],
        },
      ],
    };
    const made = generateStructures(withBays, shop);
    const partitions = made.instances.filter((i) => i.name?.startsWith("Partition"));
    expect(partitions).toHaveLength(2);
    // Interior 2212/64 less 2 x 46/64 leaves 2120/64, so a bay is 706-2/3. The first partition's
    // face is 706-2/3 -> 707 in from the interior's left, 707/64 in from the interior's left.
    // 707/64 = 2,244,725 units: the position is written as the case's side thickness plus that.
    expect(partitions[0]?.position.x).toBe(
      `(stock["3/4 plywood"].thickness) + (${707 * 3175}/203200in)`,
    );
    expect(solve(withBays, shop).blocked).toBe(false);
  });
});

describe("detaching one board", () => {
  const shelfId = (p: Project): string => p.parts.find((x) => x.source?.role === "shelf")?.id ?? "";

  it("leaves the board alone when the form changes, and everything else follows", () => {
    const made = generateStructures(form(), shop);
    const detached = detachPartIn(made, shelfId(made));
    // The user shortens the shelf by hand to 20in.
    const edited: Project = {
      ...detached,
      parts: detached.parts.map((p) => (p.detached ? { ...p, length: "20in" } : p)),
    };
    const resized = generateStructures(withParam(edited, "width", "30in"), shop);
    expect(resized.parts.find((p) => p.detached)?.length).toBe("20in");
    expect(resized.parts.find((p) => p.name === "Top")?.length).not.toBe("20in");
    expect(rules(resized)).not.toContain("error:internal-error");
  });

  it("is undone by attaching it again", () => {
    const made = generateStructures(form(), shop);
    const detached = detachPartIn(made, shelfId(made));
    const attached = attachPartIn(detached, shelfId(made));
    expect(attached.parts.find((p) => p.id === shelfId(made))?.detached).toBeUndefined();
  });

  it("refuses a board nobody generated", () => {
    expect(() =>
      detachPartIn(loadProject("bookcase"), loadProject("bookcase").parts[0]?.id ?? ""),
    ).toThrow(RangeError);
  });
});

describe("saving a structure project", () => {
  it("writes the form and not the boards it generates", () => {
    const text = serializeProject(generateStructures(form(), shop));
    const saved = parseProject(text);
    expect(saved.structures).toHaveLength(1);
    expect(saved.parts).toEqual([]);
    expect(saved.instances).toEqual([]);
    expect(saved.joints).toEqual([]);
    expect(saved.patterns).toEqual([]);
  });

  it("writes a detached board, its placement and its pattern, and nothing else generated", () => {
    const made = generateStructures(form(), shop);
    const shelf = made.parts.find((p) => p.source?.role === "shelf");
    const saved = parseProject(serializeProject(detachPartIn(made, shelf?.id ?? "")));
    expect(saved.parts.map((p) => p.name)).toEqual(["Shelf"]);
    expect(saved.parts[0]?.detached).toBe(true);
    expect(saved.instances.map((i) => i.name)).toEqual(["Shelf"]);
    expect(saved.patterns).toHaveLength(1);
    expect(saved.joints).toEqual([]);
    // Loading and generating again gives the same boards that were detached.
    expect(
      generateStructures(saved, shop)
        .parts.map((p) => p.name)
        .sort(),
    ).toEqual(made.parts.map((p) => p.name).sort());
  });

  it("is byte-identical after loading and saving", () => {
    const text = serializeProject(generateStructures(form(), shop));
    expect(serializeProject(parseProject(text))).toBe(text);
  });
});

describe("templates", () => {
  const stock = loadProject("bookcase", "structure").stock;
  const ply = stock[0];
  const back = stock[1];

  it("offers the prototype set", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual([
      "Bookcase",
      "Keepsake box",
      "Blank case",
      "Blank box",
    ]);
  });

  it("starts the bookcase from the template and reaches the golden cut list with no editing", () => {
    const template = TEMPLATES.find((t) => t.name === "Bookcase");
    expect(template).toBeDefined();
    if (!template || !ply || !back) throw new Error("fixture stock missing");
    const project = projectFromTemplate(template, {
      stock,
      stockFor: { carcaseStock: ply.id, backStock: back.id },
    });
    const expected = loadExpected<{ lines: Array<{ length: number; quantity: number }> }>(
      "bookcase",
      "cutlist",
    );
    const lines = buildCutList(project).lines;
    expect(lines.map((l) => [l.length, l.quantity])).toEqual(
      expected.lines.map((l) => [l.length, l.quantity]),
    );
  });

  it("starts a blank case that solves without errors once stock is chosen", () => {
    const template = TEMPLATES.find((t) => t.name === "Blank case");
    if (!template || !ply || !back) throw new Error("fixture stock missing");
    const project = projectFromTemplate(template, {
      stock,
      stockFor: { carcaseStock: ply.id, backStock: back.id },
    });
    expect(solve(project, shop).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("a form that cannot be built", () => {
  it("says which stock is missing instead of generating nothing silently", () => {
    const base = form();
    const structure = base.structures[0];
    if (!structure) throw new Error("no structure");
    const options = { ...structure.options };
    delete options.carcaseStock;
    const broken: Project = { ...base, structures: [{ ...structure, options }] };
    const result = solve(broken, shop);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.map((d) => d.rule)).toContain("structure-stock-missing");
  });

  it("says a case top or back style that is not built yet, and builds the rest", () => {
    const base = form();
    const structure = base.structures[0];
    if (!structure) throw new Error("no structure");
    const odd: Project = {
      ...base,
      structures: [{ ...structure, options: { ...structure.options, back: "paneled" } }],
    };
    expect(rules(odd)).toContain("warning:not-built-yet");
  });
});
