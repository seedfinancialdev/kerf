// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Structure forms: placement and parts against the hand-built reference, set heights, limits, rules
// that report what the form cannot use, detach, saving refusals, templates and options. Expected
// values are worked out by hand beside each case or taken from the hand-built fixture.

import {
  attachPartIn,
  buildCutList,
  type CutList,
  type CutListLine,
  detachPartIn,
  generateStructures,
  generateStructuresChecked,
  type MachiningSetup,
  machiningSetups,
  nest,
  type Opening,
  type Project,
  parseProject,
  projectFromTemplate,
  serializeProject,
  solve,
  solveModel,
  TEMPLATES,
} from "@kerf/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyBookcaseEdit, bookcaseEdit } from "../../src/edits";
import { loadExpected, loadProject, loadShopProfile, withParam } from "../../src/index";

/** Narrows a lookup that the test itself guarantees; a miss is a test bug, said clearly. */
function must<T>(value: T | undefined | null, what = "value"): T {
  if (value === undefined || value === null) throw new Error(`test fixture has no ${what}`);
  return value;
}

const shop = loadShopProfile();
const form = (): Project => loadProject("bookcase", "structure");
const box = (): Project => loadProject("box", "structure");
const U = 3175; // 1/64 in
const withOpenings = (
  p: Project,
  openings: Opening[],
  options: Record<string, string | boolean> = {},
): Project => {
  const s = must(p.structures[0]);
  return { ...p, structures: [{ ...s, openings, options: { ...s.options, ...options } }] };
};
const rootId = () => must(must(form().structures[0]).openings[0]).id;
const division = (d: NonNullable<Opening["division"]>, children: Opening[] = []): Project =>
  withOpenings(form(), [{ id: rootId(), division: d, children }]);
const opt = (p: Project, o: Record<string, string | boolean>): Project => {
  const s = must(p.structures[0]);
  return { ...p, structures: [{ ...s, options: { ...s.options, ...o } }] };
};
const without = (p: Project, ...keys: string[]): Project => {
  const s = must(p.structures[0]);
  const options = { ...s.options };
  for (const k of keys) delete options[k];
  return { ...p, structures: [{ ...s, options }] };
};
const shelvesIn = (id: string, count = "1"): Opening => ({
  id,
  division: { type: "shelves", count, spacing: "even" },
  children: [],
});
const inst = (p: Project) => solveModel(generateStructures(p, shop)).instances;
const at = (p: Project, name: string) => must(inst(p).find((i) => i.name === name));
const diags = (p: Project) =>
  generateStructuresChecked(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}@${d.field}`);
const errs = (p: Project) =>
  solve(p, shop)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.rule}@${d.field}`);

describe("form == hand-built placement and parts", () => {
  for (const n of ["bookcase", "box"] as const) {
    it(`${n}: placement`, () => {
      const pick = (p: Project) =>
        solveModel(p).instances.map((i) => ({
          name: i.name,
          position: i.position,
          extent: i.extent,
          orientation: i.orientation,
          mirrored: i.mirrored,
        }));
      expect(pick(generateStructures(loadProject(n, "structure"), shop))).toEqual(
        pick(loadProject(n)),
      );
    });
    it(`${n}: parts`, () => {
      const pick = (p: Project) =>
        solveModel(p).parts.map((x) => ({
          name: x.name,
          grainLocked: x.grainLocked,
          stock: x.stock,
          length: x.length,
          width: x.width,
          thickness: x.thickness,
          ops: x.ops.map((o) => ({ ...o, id: "" })),
        }));
      expect(pick(generateStructures(loadProject(n, "structure"), shop))).toEqual(
        pick(loadProject(n)),
      );
    });
  }
});

describe("shelves at set heights", () => {
  it("puts undersides at 10in and 30in", () => {
    const p = division({ type: "shelves", count: "2", spacing: ["10in", "30in"] });
    const s = inst(p).filter((i) => i.name.startsWith("Shelf"));
    expect(s.map((i) => [i.name, i.position.x, i.position.y, i.position.z])).toEqual([
      ["Shelf (1)", 146050, 50800, 2032000],
      ["Shelf (2)", 146050, 50800, 6096000],
    ]);
  });
  it("warns when the count and the list disagree", () => {
    expect(diags(division({ type: "shelves", count: "3", spacing: ["10in", "30in"] }))).toContain(
      "warning:division-ignored@shelves",
    );
  });
  it("65 heights is an error, 64 is not", () => {
    const heights = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}in`);
    expect(diags(division({ type: "shelves", count: "1", spacing: heights(65) }))).toContain(
      "error:invalid-count@shelves",
    );
    expect(diags(division({ type: "shelves", count: "1", spacing: heights(64) }))).not.toContain(
      "error:invalid-count@shelves",
    );
  });
  it("shelf_count 64 builds, 65 is reported once", () => {
    expect(
      diags(withParam(form(), "shelf_count", "64")).filter((d) => d.includes("invalid-count")),
    ).toEqual([]);
    expect(
      diags(withParam(form(), "shelf_count", "65")).filter((d) => d.includes("invalid-count")),
    ).toEqual(["error:invalid-count@shelves"]);
  });
});

describe("bays and partitions (positions by hand)", () => {
  const bays = (count: string, children: Opening[] = []) =>
    division({ type: "bays", count }, children);
  const kids = (n: number) =>
    Array.from({ length: n }, (_, i) => shelvesIn(`01K7M3Q8ZD00000000B10000A${i}`));
  it("2 bays: one partition, bay 1083/64 each, left face at 1129/64", () => {
    // interior 2212/64 less one 46/64 board = 2166/64; half is 1083/64; 46 + 1083 = 1129.
    expect(at(bays("2"), "Partition").position.x).toBe(1129 * U);
  });
  it("3 bays in 38-7/8: 12in each, partitions on the grid", () => {
    const p = withParam(bays("3", kids(3)), "width", "38-7/8in");
    expect(errs(p)).toEqual([]);
    expect(at(p, "Partition 1").position.x).toBe(814 * U);
    expect(at(p, "Partition 2").position.x).toBe(1628 * U);
    expect(
      inst(p)
        .filter((i) => i.name.startsWith("Shelf"))
        .map((i) => [i.position.x, i.extent.x]),
    ).toEqual([
      [46 * U, 768 * U],
      [860 * U, 768 * U],
      [1674 * U, 768 * U],
    ]);
  });
  it("last bay of 2 holds a partition at 1/2: nested position is from the bay's own left edge", () => {
    // 2 bays at 36in: interior 2212/64, bay (2212 - 46) / 2 = 1083 exactly. The last bay starts at
    // 46 + 1083 + 46 = 1175. Half of 1083 is 541.5, which rounds half to even to 542, so the
    // partition's left face is at 1175 + 542 = 1717.
    const p = bays("2", [
      { id: "01K7M3Q8ZD00000000B10000B0", children: [] },
      {
        id: "01K7M3Q8ZD00000000B10000B1",
        division: { type: "partition", at: "1/2" },
        children: [],
      },
    ]);
    expect(at(p, "Partition 2").position.x).toBe(1717 * U);
  });
  it("a partition at 1/2 inside the last of 3 bays uses that bay's own, wider, width", () => {
    // 3 bays: partition faces at 707 and 1459 from the interior's left (706-2/3 and 1459-1/3
    // snapped), so the last bay starts at 46 + 1459 + 46 = 1551 and is 2212 - 1505 = 707 wide.
    // Half of 707 is 353.5, which rounds half to even to 354: the partition's face is at 1905.
    const p = bays("3", [
      { id: "01K7M3Q8ZD00000000B10000B0", children: [] },
      { id: "01K7M3Q8ZD00000000B10000B1", children: [] },
      {
        id: "01K7M3Q8ZD00000000B10000B2",
        division: { type: "partition", at: "1/2" },
        children: [],
      },
    ]);
    expect(at(p, "Partition 3").position.x).toBe(1905 * U);
  });
  it("exactly as many sub-openings as bays is not reported", () => {
    expect(diags(bays("3", kids(3))).filter((d) => d.includes("division-ignored"))).toEqual([]);
  });
  it("one bay is the opening itself and says so", () => {
    expect(diags(bays("1"))).toContain("warning:division-ignored@bays");
  });
  it("more sub-openings than bays are reported", () => {
    expect(diags(bays("2", kids(3)))).toContain("warning:division-ignored@openings");
  });
  it("two openings on a case: the second is reported", () => {
    const f = form();
    const s = must(f.structures[0]);
    const p = {
      ...f,
      structures: [
        { ...s, openings: [...s.openings, { id: "01K7M3Q8ZD00000000B1000095", children: [] }] },
      ],
    };
    expect(diags(p)).toContain("warning:division-ignored@openings");
  });
  it("a partition at a count is reported", () => {
    expect(diags(division({ type: "partition", at: "3" }))).toContain(
      "error:invalid-option@partition",
    );
  });
  it("partition position boundaries: 0 and one past the room are errors, the room itself is not", () => {
    // interior 2212/64; the partition board takes 46/64; so a partition may start at 2166/64 = 33-27/32.
    expect(diags(division({ type: "partition", at: "0in" }))).toContain(
      "error:partition-outside-opening@partition",
    );
    expect(diags(division({ type: "partition", at: "33-27/32in" }))).not.toContain(
      "error:partition-outside-opening@partition",
    );
    expect(diags(division({ type: "partition", at: "33-55/64in" }))).toContain(
      "error:partition-outside-opening@partition",
    );
  });
  it("a partition at 2/3 snaps once, half to even: 2212 x 2/3 = 1474-2/3 -> 1475/64", () => {
    // Spec, Units & precision: results snap rounding half to even. 46 + 1475 from the outside.
    expect(at(division({ type: "partition", at: "2/3" }), "Partition").position.x).toBe(
      (46 + 1475) * U,
    );
  });
  it("bay count invalid: exactly one diagnostic", () => {
    expect(diags(bays("bogus")).filter((d) => d.includes("invalid-count"))).toEqual([
      "error:invalid-count@bays",
    ]);
  });
  it("keeps a shelf's id in a bay when an earlier bay is removed", () => {
    const [a, b, c] = [
      "01K7M3Q8ZD00000000B10000C0",
      "01K7M3Q8ZD00000000B10000C1",
      "01K7M3Q8ZD00000000B10000C2",
    ] as const;
    const idOfB = (p: Project) =>
      generateStructures(p, shop).parts.find(
        (x) => (x.source?.role === "shelf" && x.name.endsWith("Shelf 2")) || x.name === "Shelf 2",
      )?.id;
    const three = generateStructures(bays("3", [shelvesIn(a), shelvesIn(b), shelvesIn(c)]), shop);
    const two = generateStructures(bays("2", [shelvesIn(b), shelvesIn(c)]), shop);
    const byName = (m: Project, n: string) => m.parts.find((x) => x.name === n)?.id;
    expect(byName(two, "Shelf 1")).toBe(byName(three, "Shelf 2"));
    void idOfB;
  });
});

describe("rules not yet pinned", () => {
  it("generated-part-edited: a hand edit to a generated board's size warns, and the form wins", () => {
    const made = generateStructures(form(), shop);
    for (const key of ["length", "width", "thickness"] as const) {
      const edited = {
        ...made,
        parts: made.parts.map((p) => (p.source?.role === "top" ? { ...p, [key]: "10in" } : p)),
      };
      const r = generateStructuresChecked(edited, shop);
      expect(r.diagnostics.map((d) => `${d.severity}:${d.rule}@${d.field}`)).toContain(
        "warning:generated-part-edited@Top",
      );
    }
  });
  it("a detached board edited by hand is not warned", () => {
    const made = generateStructures(form(), shop);
    const d = detachPartIn(made, must(made.parts.find((p) => p.source?.role === "top")).id);
    const edited = { ...d, parts: d.parts.map((p) => (p.detached ? { ...p, length: "10in" } : p)) };
    expect(generateStructuresChecked(edited, shop).diagnostics.map((x) => x.rule)).not.toContain(
      "generated-part-edited",
    );
  });
  it("joint-dropped: a detached wall whose placement was deleted loses its 3 joints and the grain wrap", () => {
    const made = generateStructures(box(), shop);
    const front = must(made.parts.find((p) => p.source?.role === "front"));
    const saved = parseProject(serializeProject(detachPartIn(made, front.id)));
    const gone = { ...saved, instances: saved.instances.filter((i) => i.def !== front.id) };
    const r = generateStructuresChecked(gone, shop);
    // front: 2 dovetail corners + 1 groove = 3 joints, plus the match set that names it = 4.
    expect(r.diagnostics.find((x) => x.rule === "joint-dropped")).toMatchObject({
      severity: "warning",
      count: 4,
    });
  });
  it("invalid-option: a wrong-typed option is reported even when nothing else reads it", () => {
    expect(diags(opt(box(), { grooveOffset: true }))).toContain(
      "error:invalid-option@grooveOffset",
    );
    expect(diags(opt(box(), { grainWraps: "yes" }))).toContain("error:invalid-option@grainWraps");
    expect(
      diags(opt(form(), { dadoDepth: true })).filter((d) => d.includes("invalid-option")),
    ).toEqual(["error:invalid-option@dadoDepth"]);
  });
  it("blank stock choice says choose; a removed stock says it is gone", () => {
    const blank = diags(opt(form(), { carcaseStock: "" }));
    expect(blank).toContain("error:structure-stock-missing@the sides, top and bottom");
  });
  it("a second structure's boards are prefixed Case 2 / Box 2", () => {
    const f = form();
    const s = must(f.structures[0]);
    const second = {
      ...s,
      id: "01K7M3Q8ZD00000000B1000090",
      openings: [{ id: "01K7M3Q8ZD00000000B1000091", children: [] }],
    };
    const names = generateStructures({ ...f, structures: [s, second] }, shop).parts.map(
      (p) => p.name,
    );
    expect(names).toEqual([
      "Side",
      "Top",
      "Bottom",
      "Shelf",
      "Back",
      "Case 2 Side",
      "Case 2 Top",
      "Case 2 Bottom",
      "Case 2 Back",
    ]);
  });
  it("blank box groove sits one bottom thickness up (1/4in)", () => {
    const t = must(TEMPLATES.find((x) => x.name === "Blank box"));
    const bs = box().stock;
    const p = projectFromTemplate(t, {
      stock: bs,
      stockFor: { wallStock: must(bs[0]).id, bottomStock: must(bs[1]).id },
    });
    expect(at(p, "Bottom").position.z).toBe(50800);
  });
});

describe("detach", () => {
  const shelfId = (p: Project) => must(p.parts.find((x) => x.source?.role === "shelf")).id;
  const shelvesZ = (p: Project) =>
    inst(p)
      .filter((i) => i.name.startsWith("Shelf"))
      .map((i) => i.position.z);
  it("a detached shelf keeps its placement when the form's height changes; the rest follows", () => {
    const made = generateStructures(form(), shop);
    const d = detachPartIn(made, shelfId(made));
    const taller = withParam(d, "height", "60in");
    expect(shelvesZ(taller)).toEqual([2895600, 5794375, 8689975, 11588750]);
    expect(at(taller, "Top").position.z).toBe(60 * 203200 - 146050);
  });
  it("a detached shelf keeps its count and width when the form changes", () => {
    const made = generateStructures(form(), shop);
    const d = detachPartIn(made, shelfId(made));
    const p = withParam(withParam(d, "shelf_count", "5"), "depth", "10in");
    expect(inst(p).filter((i) => i.name.startsWith("Shelf"))).toHaveLength(4);
    expect(
      solveModel(generateStructures(p, shop)).parts.find((x) => x.name === "Shelf")?.width,
    ).toBe(12 * 203200 - 50800);
  });
  it("detaching the top leaves the shelves following the form", () => {
    const made = generateStructures(form(), shop);
    const d = detachPartIn(made, must(made.parts.find((p) => p.source?.role === "top")).id);
    const a = shelvesZ(withParam(d, "height", "60in"));
    const b = shelvesZ(withParam(form(), "height", "60in"));
    expect(a).toEqual(b);
  });
  it("detach then attach one of two leaves the other detached; unknown id is a RangeError", () => {
    const base = generateStructures(form(), shop);
    const top = must(base.parts.find((p) => p.source?.role === "top")).id;
    const one = attachPartIn(detachPartIn(detachPartIn(base, shelfId(base)), top), top);
    expect(one.parts.find((p) => p.id === shelfId(base))?.detached).toBe(true);
    expect(() => detachPartIn(base, "01K7M3Q8ZD0000000000000000")).toThrow(RangeError);
    expect(() => attachPartIn(base, "01K7M3Q8ZD0000000000000000")).toThrow(RangeError);
  });
  it("detached boards' joints survive a spacing-shape change with a warning", () => {
    const made = generateStructures(form(), shop);
    const d = parseProject(serializeProject(detachPartIn(made, shelfId(made))));
    const changed = division({ type: "shelves", count: "2", spacing: ["20in", "40in"] });
    const p = { ...d, structures: changed.structures };
    expect(diags(p)).toContain("warning:joint-dropped@detached boards");
  });
  it("PROPERTY: detaching any board changes nothing until the form changes", () => {
    const roles = ["side", "top", "bottom", "shelf", "back"];
    fc.assert(
      fc.property(bookcaseEdit, fc.constantFrom(...roles), (edit, role) => {
        const p = applyBookcaseEdit(form(), edit);
        const made = generateStructures(p, shop);
        const id = must(made.parts.find((x) => x.source?.role === role)).id;
        const d = detachPartIn(made, id);
        const key = (q: Project) =>
          JSON.stringify(
            solveModel(generateStructures(q, shop))
              .instances.map((i) => [i.name, i.position, i.extent, i.orientation, i.mirrored])
              .sort(),
          );
        expect(key(d)).toBe(key(made));
        const cut = (q: Project) =>
          buildCutList(q)
            .lines.map((l) => [l.length, l.width, l.quantity])
            .sort();
        expect(cut(d)).toEqual(cut(made));
      }),
      { numRuns: 100 },
    );
  });
});

describe("saving refusals name the first stranded reference", () => {
  const handPart = {
    id: "01K7M3Q8ZD00000000B1000960",
    name: "Hand",
    stock: "",
    length: "10in",
    width: "4in",
    grainLocked: true,
    ops: [] as never[],
  };
  const base = () => {
    const made = generateStructures(form(), shop);
    const stock = must(made.stock[0]).id;
    const part = { ...handPart, stock };
    const inst0 = {
      id: "01K7M3Q8ZD00000000B1000961",
      def: part.id,
      position: { x: "0in", y: "0in", z: "0in" },
      orientation: 0,
      mirrored: false,
    };
    return {
      made,
      part,
      inst0,
      top: must(made.instances.find((i) => i.name === "Top")),
      shelf: must(made.patterns[0]),
    };
  };
  it("host", () => {
    const { made, part, inst0, top } = base();
    const p = {
      ...made,
      parts: [...made.parts, part],
      instances: [...made.instances, inst0],
      joints: [
        ...made.joints,
        {
          id: "01K7M3Q8ZD00000000B1000962",
          type: "dado" as const,
          host: top.id,
          guest: inst0.id,
          params: {},
        },
      ],
    };
    expect(() => serializeProject(p)).toThrow(/\$\.joints\[0\]\.host/);
  });
  it("guest", () => {
    const { made, part, inst0, top } = base();
    const p = {
      ...made,
      parts: [...made.parts, part],
      instances: [...made.instances, inst0],
      joints: [
        ...made.joints,
        {
          id: "01K7M3Q8ZD00000000B1000962",
          type: "dado" as const,
          host: inst0.id,
          guest: top.id,
          params: {},
        },
      ],
    };
    expect(() => serializeProject(p)).toThrow(/\$\.joints\[0\]\.guest/);
  });
  it("parent", () => {
    const { made, part, inst0, top } = base();
    const p = {
      ...made,
      parts: [...made.parts, part],
      instances: [...made.instances, { ...inst0, parent: top.id }],
    };
    expect(() => serializeProject(p)).toThrow(/\.parent/);
  });
  it("pattern source", () => {
    const { made, part, inst0, top } = base();
    const pat = {
      id: "01K7M3Q8ZD00000000B1000963",
      source: top.id,
      count: "2",
      axis: "z" as const,
      spacing: { mode: "fixed" as const, step: "1in" },
    };
    const p = {
      ...made,
      parts: [...made.parts, part],
      instances: [...made.instances, inst0],
      patterns: [...made.patterns, pat],
    };
    expect(() => serializeProject(p)).toThrow(/\.source/);
  });
  it("match set member", () => {
    const { made, part, inst0, top } = base();
    const ms = {
      id: "01K7M3Q8ZD00000000B1000964",
      name: "m",
      type: "continuousGrain" as const,
      members: [inst0.id, top.id],
      axis: "length" as const,
    };
    const p = {
      ...made,
      parts: [...made.parts, part],
      instances: [...made.instances, inst0],
      matchSets: [...made.matchSets, ms],
    };
    expect(() => serializeProject(p)).toThrow(/\.members\[1\]/);
  });
});

describe("stock names", () => {
  it("a backslash in a stock name is refused like a quote", () => {
    const f = form();
    const p = { ...f, stock: f.stock.map((x, i) => (i === 0 ? { ...x, name: "ply\\3/4" } : x)) };
    expect(diags(p).join()).toContain("error:stock-name-unsupported");
  });
});

describe("templates", () => {
  const stock = form().stock;
  const find = (n: string) => must(TEMPLATES.find((t) => t.name === n));
  it("bookcase template: full lines", () => {
    const project = projectFromTemplate(find("Bookcase"), {
      stock,
      stockFor: { carcaseStock: must(stock[0]).id, backStock: must(stock[1]).id },
    });
    const exp = loadExpected<CutList>("bookcase", "cutlist");
    const strip = (l: CutListLine) => ({
      length: l.length,
      width: l.width,
      quantity: l.quantity,
      stock: l.stock,
      visible: l.visible,
    });
    expect(buildCutList(project).lines.map(strip)).toEqual(exp.lines.map(strip));
  });
  it("keepsake box template: golden box cut list and blocks", () => {
    const bs = box().stock;
    const project = projectFromTemplate(find("Keepsake box"), {
      stock: bs,
      stockFor: { wallStock: must(bs[0]).id, bottomStock: must(bs[1]).id },
    });
    const exp = loadExpected<CutList>("box", "cutlist");
    const norm = (c: CutList) => ({
      lines: c.lines,
      blocks: c.blocks.map((b) => ({ ...b, matchSet: "" })),
    });
    expect(norm(buildCutList(project))).toEqual(norm(exp));
  });
  it("bookcase template: golden sheets and setups, not only the cut list", () => {
    const project = projectFromTemplate(find("Bookcase"), {
      stock,
      stockFor: { carcaseStock: must(stock[0]).id, backStock: must(stock[1]).id },
    });
    const layouts = loadExpected<{ sheetCountByStock: Record<string, number> }>(
      "bookcase",
      "layouts",
    );
    const setups = loadExpected<{ setups: MachiningSetup[] }>("bookcase", "setups");
    expect(nest(project, shop).sheetCountByStock).toEqual(layouts.sheetCountByStock);
    expect(machiningSetups(project, shop).map(({ parts: _p, ...r }) => r)).toEqual(setups.setups);
  });
  it("keepsake template: the golden box validation, nothing else", () => {
    const bs = box().stock;
    const project = projectFromTemplate(find("Keepsake box"), {
      stock: bs,
      stockFor: { wallStock: must(bs[0]).id, bottomStock: must(bs[1]).id },
    });
    const rules = [
      ...new Set(
        solve(project, shop)
          .diagnostics.filter((d) => d.severity !== "info")
          .map((d) => d.rule),
      ),
    ];
    expect(rules).toEqual(["groove-outside-bottom-half-pin"]);
  });
  it("blank case template builds with a back", () => {
    const s = form().stock;
    const p = projectFromTemplate(find("Blank case"), {
      stock: s,
      stockFor: { carcaseStock: must(s[0]).id, backStock: must(s[1]).id },
    });
    expect(generateStructures(p, shop).parts.map((x) => x.name)).toContain("Back");
  });
  it("template options and params are copies; name and structure id options are honoured", () => {
    const t = find("Bookcase");
    const p = projectFromTemplate(t, {
      name: "Mine",
      structureId: "01K7M3Q8ZD00000000B1000777",
      stock,
      stockFor: { carcaseStock: must(stock[0]).id },
    });
    expect(p.name).toBe("Mine");
    expect(must(p.structures[0]).id).toBe("01K7M3Q8ZD00000000B1000777");
    must(p.params[0]).expr = "1in";
    expect(must(t.params[0]).expr).toBe("36in");
    expect(t.structure.options.carcaseStock).toBeUndefined();
  });
  it("every template with stock chosen solves with no errors", () => {
    for (const t of TEMPLATES) {
      const isBox = t.structure.type === "box";
      const s = isBox ? box().stock : stock;
      const stockFor = isBox
        ? { wallStock: must(s[0]).id, bottomStock: must(s[1]).id }
        : { carcaseStock: must(s[0]).id, backStock: must(s[1]).id };
      const p = projectFromTemplate(t, { stock: s, stockFor });
      expect(errs(p), t.name).toEqual([]);
    }
  });
});

describe("options", () => {
  it("dado and rabbet depth are separate", () => {
    const p = opt(form(), { dadoDepth: "3/16in", rabbetDepth: "5/16in" });
    const len = (n: string) =>
      buildCutList(p).lines.find((l) => l.parts.some((x) => x.name === n))?.length;
    expect(len("Top")).toBe(2252 * U);
    expect(len("Shelf")).toBe(2236 * U);
  });
  it("no back style and no back stock: no back; back stock alone: inset back", () => {
    const names = (p: Project) => generateStructures(p, shop).parts.map((x) => x.name);
    expect(names(without(form(), "back", "backStock"))).not.toContain("Back");
    expect(errs(without(form(), "back", "backStock"))).toEqual([]);
    expect(names(without(form(), "back"))).toContain("Back");
  });
  it("no roundover option: no ops", () => {
    expect(
      generateStructures(without(form(), "shelfRoundover"), shop).parts.find(
        (p) => p.source?.role === "shelf",
      )?.ops,
    ).toEqual([]);
  });
  it("box without a bottom needs no bottom stock", () => {
    const s = must(box().structures[0]);
    const options: Record<string, string | boolean> = { ...s.options, bottom: "none" };
    delete options.bottomStock;
    const p = { ...box(), structures: [{ ...s, options }] };
    expect(diags(p).filter((d) => d.startsWith("error"))).toEqual([]);
    expect(generateStructures(p, shop).parts.map((x) => x.name)).not.toContain("Bottom");
  });
  it("warns topBottom, cornerJoint; grainWraps only for true", () => {
    expect(diags(opt(form(), { topBottom: "mitered" }))).toContain(
      "warning:not-built-yet@topBottom",
    );
    expect(diags(opt(box(), { cornerJoint: "half-blind" }))).toContain(
      "warning:not-built-yet@cornerJoint",
    );
    expect(generateStructures(opt(box(), { grainWraps: false }), shop).matchSets).toEqual([]);
  });
  it("a blank depth falls back to the default rule", () => {
    expect(
      buildCutList(opt(form(), { dadoDepth: "  ", rabbetDepth: "", backRabbetDepth: " " })),
    ).toEqual(buildCutList(without(form(), "dadoDepth", "rabbetDepth", "backRabbetDepth")));
  });
});

describe("ids", () => {
  it("two structures never share an id", () => {
    const f = form();
    const s = must(f.structures[0]);
    const second = {
      ...s,
      id: "01K7M3Q8ZD00000000B1000060",
      openings: [{ ...must(s.openings[0]), id: "01K7M3Q8ZD00000000B1000061" }],
    };
    const m = generateStructures({ ...f, structures: [s, second] }, shop);
    const ids = [...m.parts, ...m.instances, ...m.patterns, ...m.joints].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
