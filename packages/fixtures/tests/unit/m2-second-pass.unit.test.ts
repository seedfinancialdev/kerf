// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Defects found by the second M2 review pass, each written to fail first.

import {
  INCH,
  machiningSetups,
  nest,
  type Project,
  parseProject,
  type ShopProfile,
  serializeProject,
  solve,
  validateProject,
} from "@kerf/core";
import { buildDisplayMesh, initGeometry, MeshError } from "@kerf/geometry";
import { beforeAll, describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;
const rules = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const ply = (name: string, l: string, w: string, extra: Partial<PartSpec> = {}): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
  ...extra,
});
const wood = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "1/2in",
  stock: "wood",
});
const at = (name: string, y: string): InstanceSpec => ({ name, part: name, at: ["0in", y, "0in"] });

describe("a same-board set must really fit the sheet", () => {
  const set = (members: string[]) => ({
    matchSets: [{ name: "Together", type: "sameBoard" as const, members }],
  });

  it("reports a member larger than the sheet instead of placing it off the edge", () => {
    const p = boards(
      [ply("Big", "100in", "10in"), ply("Small", "10in", "10in")],
      [at("Big", "0in"), at("Small", "12in")],
      [],
      set(["Big", "Small"]),
    );
    const result = solve(p, shop);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.map((d) => d.rule)).toContain("match-set-too-large");
    for (const s of result.nesting.sheets) {
      for (const x of s.placements) expect(x.x + x.length).toBeLessThanOrEqual(inch(96));
    }
  });

  it("turns an unlocked member that fits only the other way round", () => {
    const p = boards(
      [ply("Wide", "30in", "60in", { locked: false }), ply("Small", "10in", "10in")],
      [at("Wide", "0in"), at("Small", "70in")],
      [],
      set(["Wide", "Small"]),
    );
    const result = solve(p, shop);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const wide = result.nesting.sheets[0]?.placements.find((x) => x.name === "Wide");
    expect(wide?.rotated).toBe(true);
    expect((wide?.y ?? 0) + (wide?.width ?? 0)).toBeLessThanOrEqual(inch(48));
  });
});

describe("overlaps are not hidden by a joint that did not join the parts", () => {
  it("reports a shelf that passes through a second side the dado never touched", () => {
    // Two sides 10" apart (a pattern); the shelf is seated against the first and runs on through
    // the second. The dado joins it to the first side only.
    const side = ply("Side", "20in", "6in");
    const shelf = ply("Shelf", "20in", "6in");
    const p = boards(
      [side, shelf],
      [
        { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
        { name: "Shelf", part: "Shelf", at: ["3/4in", "0in", "5in"] },
      ],
      [{ type: "dado", host: "Side", guest: "Shelf" }],
      {
        patterns: [
          { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
        ],
      },
    );
    expect(rules(p)).toContain("error:overlap");
  });
});

describe("pattern joints say what is wrong, and count it once", () => {
  const manyDividers = (n: number, params: Record<string, string>): Project => {
    const host: PartSpec = { name: "Host", length: "60in", width: "12in", thickness: "3/4in" };
    const div: PartSpec = { name: "Div", length: "4in", width: "10in", thickness: "1/2in" };
    return boards(
      [host, div],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Div", part: "Div", at: ["2in", "1in", "3/4in"], orientation: 17 },
      ],
      [{ type: "dado", host: "Host", guest: "Div", params }],
      {
        patterns: [
          { source: "Div", count: String(n), axis: "x", spacing: { mode: "fixed", step: "2in" } },
        ],
      },
    );
  };

  it("counts every failing guest exactly once, with no false 'does not touch'", () => {
    const result = solve(manyDividers(8, { depth: "3/4in" }), shop);
    const tooDeep = result.diagnostics.filter((d) => d.rule === "dado-too-deep");
    expect(tooDeep.reduce((sum, d) => sum + (d.count ?? 1), 0)).toBe(8);
    expect(result.diagnostics.map((d) => d.rule)).not.toContain("joint-no-contact");
  });

  it("names an interpenetrating pattern guest as an overlap, not as 'does not touch'", () => {
    const p = manyDividers(3, {});
    const sunk: Project = {
      ...p,
      instances: p.instances.map((i) =>
        i.name === "Div" ? { ...i, position: { ...i.position, z: "1/2in" } } : i,
      ),
    };
    const found = rules(sunk);
    expect(found).not.toContain("error:joint-no-contact");
    expect(found.some((r) => r === "error:joint-overlap" || r === "error:overlap")).toBe(true);
  });
});

describe("a rabbet is seated against its shoulder", () => {
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const back: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
  const rabbet = (y: string, params: Record<string, string>): Project =>
    boards(
      [host, back],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Back", part: "Back", at: ["2in", y, "3/4in"], orientation: 16 },
      ],
      [{ type: "rabbet", host: "Host", guest: "Back", params }],
    );

  it("accepts a guest against the shoulder of a wider rabbet, and cuts the rabbet that wide", () => {
    // A 3/8" rabbet with a 1/4" board against the shoulder (y = 1/8" to 3/8").
    expect(rules(rabbet("1/8in", { width: "3/8in" }))).toEqual([]);
  });

  it("still rejects a guest with a gap at the shoulder, or one that hangs past it", () => {
    expect(rules(rabbet("0in", { width: "3/8in" }))).toContain("error:rabbet-not-seated");
    expect(rules(rabbet("0in", { width: "1/8in" }))).toContain("error:rabbet-not-seated");
  });

  it("accepts the default: the guest's own thickness, flush with the edge", () => {
    expect(rules(rabbet("0in", {}))).toEqual([]);
  });
});

describe("match sets on shared boards and cut sequences", () => {
  it("puts two continuous-grain sets that fit one board on one board", () => {
    const p = boards(
      [
        wood("A1", "10in", "4in"),
        wood("A2", "10in", "4in"),
        wood("B1", "10in", "4in"),
        wood("B2", "10in", "4in"),
      ],
      [at("A1", "0in"), at("A2", "5in"), at("B1", "10in"), at("B2", "15in")],
      [],
      {
        matchSets: [
          { name: "One", type: "continuousGrain", members: ["A1", "A2"] },
          { name: "Two", type: "continuousGrain", members: ["B1", "B2"] },
        ],
      },
    );
    const layouts = solve(p, shop).nesting.boards;
    expect(layouts).toHaveLength(2); // one per set
    expect(new Set(layouts.map((b) => b.boardIndex)).size).toBe(1); // on one board
  });

  it("cuts the blank out, then divides it into the members of a run on a sheet", () => {
    const p = boards(
      [ply("F1", "20in", "6in"), ply("F2", "20in", "6in"), ply("F3", "20in", "6in")],
      [at("F1", "0in"), at("F2", "7in"), at("F3", "14in")],
      [],
      {
        matchSets: [
          { name: "Fronts", type: "continuousGrain", axis: "length", members: ["F1", "F2", "F3"] },
        ],
      },
    );
    const sheet = solve(p, shop).nesting.sheets[0];
    expect(sheet?.cutSequence).toEqual([
      { op: "rip", sizes: [inch(6)] },
      { op: "crosscut", sizes: [inch(60.25)] }, // the blank: 3 x 20" and two 1/8" kerfs
      { op: "crosscut", sizes: [inch(20), inch(20), inch(20)] }, // then divided into the fronts
    ]);
  });
});

describe("joint parameters out of range, and other errors still reported", () => {
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  const dado = (params: Record<string, string>): Project =>
    boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at: ["2in", "2in", "3/4in"], orientation: 16 },
      ],
      [{ type: "dado", host: "Host", guest: "Guest", params }],
    );

  it.each(["depth", "fit", "stop"])(
    "a %s above 100,000in is out-of-range, not an internal error",
    (key) => {
      const found = rules(dado({ [key]: "100001in" }));
      expect(found).toContain("error:out-of-range");
      expect(found).not.toContain("error:internal-error");
    },
  );
});

describe("work is bounded for huge overlapping patterns", () => {
  it("does not derive millions of pairs between overlapping pattern members", () => {
    const host: PartSpec = { name: "Host", length: "96in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/2in" };
    const p = boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["2in", "0.5in", "3/4in"], orientation: 17 },
      ],
      [{ type: "dado", host: "Host", guest: "G" }],
      {
        patterns: [
          { source: "Host", count: "2500", axis: "x", spacing: { mode: "fixed", step: "1/32in" } },
          { source: "G", count: "2500", axis: "x", spacing: { mode: "fixed", step: "1/32in" } },
        ],
      },
    );
    const started = Date.now();
    const result = solve(p, shop);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.length).toBeLessThan(100);
  });
});

describe("wrappers agree with solve and keep failures visible", () => {
  it("nest and machiningSetups return what solve returns", () => {
    const bookcase = loadProject("bookcase");
    const whole = solve(bookcase, shop);
    expect(nest(bookcase, shop)).toEqual(whole.nesting);
    expect(machiningSetups(bookcase, shop)).toEqual(whole.setups);
  });

  it("a shop that changes its answers between reads cannot slip past validation", () => {
    let reads = 0;
    const flipping = {
      tools: shop.tools,
      get kerf(): number {
        reads += 1;
        return reads === 1 ? 25400 : -5;
      },
    } as unknown as ShopProfile;
    const result = solve(loadProject("bookcase"), flipping);
    // Either it was read once (valid, and used as read) or it is reported; it is never both
    // "valid" and nested with a negative kerf.
    const placements = result.nesting.sheets.flatMap((s) => s.placements);
    const xs = placements.filter((p) => p.y === 0).map((p) => p.x);
    expect(xs.every((x) => x >= 0)).toBe(true);
    for (const s of result.nesting.sheets) {
      const row = s.placements.filter((p) => p.y === 0).sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) {
        const prev = row[i - 1];
        const cur = row[i];
        if (prev && cur) expect(cur.x).toBeGreaterThanOrEqual(prev.x + prev.length);
      }
    }
  });

  it("a shop with a throwing getter is reported, not thrown", () => {
    const hostile = {
      get kerf(): number {
        throw new Error("boom");
      },
      tools: [],
    } as unknown as ShopProfile;
    expect(() => solve(loadProject("bookcase"), hostile)).not.toThrow();
    expect(rules(loadProject("bookcase"), hostile)).toContain("error:invalid-shop");
  });
});

describe("stock sizes are bounded like every other length", () => {
  it("rejects a stock thickness or sheet size beyond the supported range when the file is read", () => {
    const base = loadProject("bookcase");
    const huge: Project = {
      ...base,
      stock: base.stock.map((s, i) => (i === 0 ? { ...s, thickness: 2 ** 52 } : s)),
    };
    expect(rules(huge)).toContain("error:invalid-project");
  });
});

describe("the display mesh rejects unknown input with a MeshError", () => {
  beforeAll(async () => {
    await initGeometry();
  });
  const blank = { length: inch(12), width: inch(6), thickness: inch(0.75) };

  it.each([
    ["an unknown primitive kind", { kind: "sphere" }],
    [
      "an unknown prism plane",
      {
        kind: "trapezoidPrism",
        plane: "foo",
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        range: [0, 1],
      },
    ],
    ["a null entry", null],
    ["a box with fractional coordinates", { kind: "box", min: [0.5, 0, 0], max: [1, 1, 1] }],
  ])("%s", (_label, removal) => {
    expect(() => buildDisplayMesh(blank, [removal as never])).toThrow(MeshError);
  });
});

describe("third review: joints that quietly do the wrong thing", () => {
  it("two rabbet joints on one pair are an error, not a doubled cut size", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const back: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
    const joint = { type: "rabbet" as const, host: "Host", guest: "Back" };
    const p = boards(
      [host, back],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Back", part: "Back", at: ["2in", "0in", "3/4in"], orientation: 16 },
      ],
      [joint, joint],
    );
    const result = solve(p, shop);
    expect(result.diagnostics.map((d) => d.rule)).toContain("duplicate-joint");
    expect(result.blocked).toBe(true);
  });

  it("warns when a copy of a patterned host is joined to nothing", () => {
    const p = boards(
      [ply("Side", "20in", "6in"), ply("Shelf", "8in", "6in")],
      [
        { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
        { name: "Shelf", part: "Shelf", at: ["3/4in", "0in", "5in"] },
      ],
      [{ type: "dado", host: "Side", guest: "Shelf" }],
      {
        patterns: [
          { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
        ],
      },
    );
    expect(rules(p)).toContain("warning:joint-host-unjoined");
  });
});

describe("third PR review: reading and bookmatch edges", () => {
  it("rejects a sheet stock that carries board sizes, and a board stock that carries sheet sizes", () => {
    const base = loadProject("bookcase");
    const sheet = base.stock.find((s) => s.kind === "sheet");
    expect(sheet).toBeDefined();
    const wrong: Project = {
      ...base,
      stock: base.stock.map((s) =>
        s === sheet ? { ...s, solid: { standardLengths: [inch(96)], maxWidth: inch(8) } } : s,
      ),
    };
    expect(rules(wrong)).toContain("error:invalid-project");
  });

  it("reports a project that throws when read, instead of throwing or blaming Kerf", () => {
    const hostile = {
      get name(): string {
        throw new Error("boom");
      },
    };
    const checked = validateProject(hostile);
    expect(checked.problem?.message).toMatch(/plain data/);
    expect(rules(hostile as unknown as Project)).not.toContain("error:internal-error");
  });

  it("says a bookmatch needs a pair, and refuses a thickness beyond the length limit", () => {
    const wood = (name: string): PartSpec => ({
      name,
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    });
    const single = boards([wood("A")], [at("A", "0in")], [], {
      matchSets: [{ name: "Doors", type: "bookmatch", members: ["A"] }],
    });
    expect(rules(single)).toContain("warning:bookmatch-needs-pair");

    const pair = boards([wood("A"), wood("B")], [at("A", "0in"), at("B", "5in")], [], {
      matchSets: [{ name: "Doors", type: "bookmatch", members: ["A", "B"] }],
    });
    const huge: Project = { ...pair, planingAllowance: 100_000 * INCH };
    expect(rules(huge)).toContain("error:out-of-range");
  });

  it("names a planing allowance out of range in inches, not internal units", () => {
    const text = serializeProject(loadProject("box"));
    const bad = text.replace(
      '"units": "imperial"',
      '"planingAllowance": -1,\n  "units": "imperial"',
    );
    expect(() => parseProject(bad)).toThrow(/in\b/);
    expect(() => parseProject(bad)).not.toThrow(/20320000000/);
  });
});
