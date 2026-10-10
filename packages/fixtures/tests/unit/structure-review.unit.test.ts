// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the M3 reviews found: structure forms that are divided, detached, saved, copied or
// mis-set. Every expected value is worked out by hand beside the case.

import {
  buildCutList,
  detachPartIn,
  generateStructures,
  INCH,
  type Project,
  ProjectFormatError,
  parseProject,
  projectFromTemplate,
  serializeProject,
  solve,
  TEMPLATES,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const form = (): Project => loadProject("bookcase", "structure");
const sixtyFourths = (n: number): number => (n * INCH) / 64;
const diag = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const errors = (p: Project) => solve(p, shop).diagnostics.filter((d) => d.severity === "error");

type Division = NonNullable<Project["structures"][number]["openings"][number]["division"]>;
const withOpening = (
  base: Project,
  division: Division | undefined,
  children: Project["structures"][number]["openings"] = [],
): Project => {
  const structure = base.structures[0];
  const root = structure?.openings[0];
  if (!structure || !root) throw new Error("form has no opening");
  const opening = { id: root.id, children, ...(division ? { division } : {}) };
  return { ...base, structures: [{ ...structure, openings: [opening] }] };
};
const shelves = (n: number, id: string) => ({
  id,
  division: { type: "shelves" as const, count: String(n), spacing: "even" as const },
  children: [],
});
const OPEN = (n: number) => `01K7M3Q8ZD00000000B10000${n.toString().padStart(2, "0")}`;

describe("bays and partitions with shelves in them", () => {
  it.each([3, 4, 5, 6])("%d bays with 2 shelves each solve with no errors at 36in", (bays) => {
    const p = withOpening(
      form(),
      { type: "bays", count: String(bays) },
      Array.from({ length: bays }, (_, i) => shelves(2, OPEN(80 + i))),
    );
    expect(errors(p)).toEqual([]);
  });

  it("snaps the bay width once: 3 bays in 34-9/16 less 2 partitions", () => {
    // Interior 34-9/16 = 2212/64; two partitions of 23/32 = 46/64 each take 92/64; 2120/64 / 3 =
    // 706-2/3 sixty-fourths, snapped down to 706/64 for every bay (the last takes the rest).
    // First partition's left face: 23/32 + 706/64 = 752/64 from the case's outside.
    const p = withOpening(form(), { type: "bays", count: "3" }, [
      shelves(1, OPEN(80)),
      shelves(1, OPEN(81)),
      shelves(1, OPEN(82)),
    ]);
    const lengths = buildCutList(p).lines.flatMap((l) =>
      l.parts.filter((x) => x.name.startsWith("Shelf")).map(() => l.length),
    );
    // Shelf length = bay width + 2 x 1/4" dado: 706/64 + 32/64 = 738/64 for the first two, and the
    // last bay is wider by the remainder (2212 - 2 x 46 - 2 x 706 = 708/64 -> 740/64).
    expect(new Set(lengths)).toEqual(new Set([sixtyFourths(738), sixtyFourths(740)]));
  });

  it("a partition at a fraction of the opening: 1/3 from the left", () => {
    // 1/3 of 34-9/16 (2212/64) = 737-1/3 sixty-fourths, snapped down to 737/64; the left shelf is
    // 737/64 visible, + 32/64 of dado = 769/64.
    const p = withOpening(form(), { type: "partition", at: "1/3" }, [
      shelves(1, OPEN(80)),
      shelves(1, OPEN(81)),
    ]);
    expect(errors(p)).toEqual([]);
    const left = buildCutList(p).lines.find((l) => l.parts.some((x) => x.name === "Shelf 1"));
    expect(left?.length).toBe(sixtyFourths(769));
  });
});

describe("shelf counts", () => {
  it("zero shelves builds the case with none, and says nothing is wrong", () => {
    const p = withParam(form(), "shelf_count", "0");
    expect(errors(p)).toEqual([]);
    expect(buildCutList(p).lines.some((l) => l.parts.some((x) => x.name === "Shelf"))).toBe(false);
  });
});

describe("what a case does with form inputs it cannot use", () => {
  it.each([
    [
      "children under shelves",
      { type: "shelves" as const, count: "2", spacing: "even" as const },
      1,
    ],
    ["a single bay", { type: "bays" as const, count: "1" }, 1],
    ["more children than a partition has sides", { type: "partition" as const, at: "12in" }, 3],
  ])("warns about %s", (_label, division, children) => {
    const p = withOpening(
      form(),
      division,
      Array.from({ length: children }, (_, i) => shelves(1, OPEN(80 + i))),
    );
    expect(diag(p)).toContain("warning:division-ignored");
  });

  it("names a partition that does not fit the opening, on the form's own field", () => {
    const p = withOpening(form(), { type: "partition", at: "100in" }, []);
    const found = solve(p, shop).diagnostics.find((d) => d.rule === "partition-outside-opening");
    expect(found).toMatchObject({ severity: "error" });
  });

  it("names bays too narrow to build", () => {
    const p = withOpening(form(), { type: "bays", count: "64" }, []);
    expect(diag(p)).toContain("error:bays-too-narrow");
  });

  it("says a wrong-typed option is wrong instead of using the default", () => {
    const base = form();
    const s = base.structures[0];
    if (!s) throw new Error("no structure");
    const odd: Project = {
      ...base,
      structures: [{ ...s, options: { ...s.options, dadoDepth: true } }],
    };
    expect(diag(odd)).toContain("error:invalid-option");
  });

  it("names a stock with a quote in its name, instead of failing every expression", () => {
    const base = form();
    const odd: Project = {
      ...base,
      stock: base.stock.map((s, i) => (i === 0 ? { ...s, name: 'plywood 3/4"' } : s)),
    };
    const rules = diag(odd);
    expect(rules).toContain("error:stock-name-unsupported");
    expect(rules).not.toContain("error:expression-syntax");
  });

  it("numbers the boards of a second structure so names stay unique", () => {
    const base = form();
    const s = base.structures[0];
    if (!s) throw new Error("no structure");
    const second = {
      ...s,
      id: "01K7M3Q8ZD00000000B1000090",
      openings: [{ id: "01K7M3Q8ZD00000000B1000091", children: [] }],
    };
    const made = generateStructures({ ...base, structures: [s, second] }, shop);
    expect(new Set(made.parts.map((p) => p.name)).size).toBe(made.parts.length);
  });
});

describe("detaching", () => {
  const shelfId = (p: Project): string => p.parts.find((x) => x.source?.role === "shelf")?.id ?? "";

  it("freezes the board where it is, instead of letting it follow the form", () => {
    const made = generateStructures(form(), shop);
    const detached = detachPartIn(made, shelfId(made));
    const shelf = detached.parts.find((p) => p.detached);
    // 36 - 2 x 23/32 = 34-9/16 = 7,023,100 units, written as an exact length.
    expect(shelf?.length).toBe("7023100/203200in");
    const placed = detached.instances.find((i) => i.def === shelf?.id);
    // Four shelves share 70-9/16 between the top and bottom boards with equal gaps: each gap is
    // (70-9/16 - 4 x 23/32) / 5 = 13.5375, so the first shelf's underside is 23/32 + 13.5375 =
    // 14.25625 up, which snaps to 14-1/4 = 2,895,600 units. It stands 23/32 in from the side.
    expect(placed?.position.z).toBe("2895600/203200in");
    expect(placed?.position.x).toBe("146050/203200in");
  });

  it("and a resize that would leave it short of a side is reported, not hidden", () => {
    const made = generateStructures(form(), shop);
    const detached = detachPartIn(made, shelfId(made));
    // 36 -> 40in: the interior is now 38-9/16 and the frozen shelf is 34-9/16, so it no longer
    // meets the left side; its dado cannot be made.
    expect(diag(withParam(detached, "width", "40in"))).toContain("error:joint-no-contact");
  });

  it("keeps working when the form's shelf spacing changes shape afterwards", () => {
    const made = generateStructures(form(), shop);
    const detached = detachPartIn(made, shelfId(made));
    const saved = parseProject(serializeProject(detached));
    const changed = withOpening(saved, {
      type: "shelves",
      count: "2",
      spacing: ["20in", "40in"],
    });
    const result = solve(changed, shop);
    expect(result.diagnostics.map((d) => d.rule)).not.toContain("invalid-project");
  });

  it("says when a detached board no longer has a place in the form", () => {
    const made = generateStructures(form(), shop);
    const saved = parseProject(serializeProject(detachPartIn(made, shelfId(made))));
    const gone = withOpening(saved, undefined);
    expect(diag(gone)).toContain("warning:detached-board-orphaned");
  });

  it("keeps a bay's partition id when bays are added elsewhere", () => {
    const bays = (n: number) =>
      generateStructures(
        withOpening(form(), { type: "bays", count: String(n) }, []),
        shop,
      ).parts.find((p) => p.name === "Partition 1")?.id;
    expect(bays(3)).toBe(bays(4));
  });
});

describe("saving", () => {
  it("refuses, naming the cause, when a hand-made joint names a generated board", () => {
    const made = generateStructures(form(), shop);
    const top = made.instances.find((i) => i.name === "Top");
    const back = made.instances.find((i) => i.name === "Back");
    if (!top || !back) throw new Error("form did not generate the boards");
    const joined: Project = {
      ...made,
      joints: [
        ...made.joints,
        {
          id: "01K7M3Q8ZD00000000B1000099",
          type: "rabbet",
          host: top.id,
          guest: back.id,
          params: {},
        },
      ],
    };
    expect(() => serializeProject(joined)).toThrow(ProjectFormatError);
    expect(() => serializeProject(joined)).toThrow(/detach/i);
  });

  it("refuses a hand-made copy of a generated board instead of dropping it", () => {
    const made = generateStructures(form(), shop);
    const shelf = made.instances.find((i) => i.name === "Shelf");
    if (!shelf) throw new Error("no shelf");
    const copy = {
      ...shelf,
      id: "01K7M3Q8ZD00000000B1000098",
      generatedBy: undefined,
      position: { ...shelf.position, z: "36in" },
    };
    const { generatedBy: _gone, ...handMade } = copy;
    const copied: Project = { ...made, instances: [...made.instances, handMade] };
    // It is kept in the working project...
    expect(generateStructures(copied, shop).instances.some((i) => i.id === handMade.id)).toBe(true);
    // ...and saving says why it cannot be written.
    expect(() => serializeProject(copied)).toThrow(ProjectFormatError);
  });
});

describe("the public functions", () => {
  it("reports an invalid project with a typed error, not a TypeError", () => {
    expect(() => generateStructures(null as unknown as Project, shop)).toThrow(ProjectFormatError);
    expect(() => generateStructures({} as unknown as Project, shop)).toThrow(ProjectFormatError);
  });
});

describe("templates", () => {
  it("gives the blank box a groove that does not break out of the wall's bottom edge", () => {
    const template = TEMPLATES.find((t) => t.name === "Blank box");
    const boxStock = loadProject("box", "structure").stock;
    const [wall, bottom] = boxStock;
    if (!template || !wall || !bottom) throw new Error("fixture missing");
    const project = projectFromTemplate(template, {
      stock: boxStock,
      stockFor: { wallStock: wall.id, bottomStock: bottom.id },
    });
    const made = generateStructures(project, shop);
    const groove = made.instances.find((i) => i.name === "Bottom");
    // The bottom sits above the walls' bottom edge by its own thickness (1/4").
    expect(groove?.position.z).not.toBe("0in");
  });
});
