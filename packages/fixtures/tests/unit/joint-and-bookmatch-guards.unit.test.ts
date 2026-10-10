// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Guards found missing by the PR test review: each case pins a boundary or a branch that a
// plausible one-line mistake would otherwise slip through. Values are worked out by hand in the
// comments (1in = 203,200 units).

import {
  deriveJointCuts,
  INCH,
  MAX_LENGTH,
  type Project,
  ProjectFormatError,
  parseProject,
  serializeProject,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec, WOOD_ID } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;
const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const rabbetP = (
  params: Record<string, string>,
  at: [string, string, string],
  o: number,
): Project =>
  boards(
    [host, guest],
    [
      { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
      { name: "Guest", part: "Guest", at, orientation: o },
    ],
    [{ type: "rabbet", host: "Host", guest: "Guest", params }],
  );

describe("rabbet footprint", () => {
  it("control: lengthwise guest seated in end0 step", () =>
    expect(rules(rabbetP({ width: "5in" }, ["0in", "2in", "3/4in"], 16))).toEqual([]));
  it("control: seated end0", () =>
    expect(rules(rabbetP({}, ["0in", "0in", "3/4in"], 17))).toEqual([]));
  it("end0 guest 4in long hanging past x=0", () =>
    expect(rules(rabbetP({ width: "2in" }, ["-3in", "2in", "3/4in"], 16))).toContain(
      "error:rabbet-not-seated",
    ));
  it("end1 guest 4in long hanging past x=L", () =>
    expect(rules(rabbetP({ width: "1in" }, ["11in", "0in", "3/4in"], 16))).toContain(
      "error:rabbet-not-seated",
    ));
  it("edge1 guest 5in wide hanging past y=W", () =>
    expect(rules(rabbetP({ width: "1in" }, ["2in", "5in", "3/4in"], 17))).toContain(
      "error:rabbet-not-seated",
    ));
});

const wood = (n: string, l = "10in", w = "4in", t = "3/4in"): PartSpec => ({
  name: n,
  length: l,
  width: w,
  thickness: t,
  stock: "wood",
});
const at = (n: string, y: string): InstanceSpec => ({ name: n, part: n, at: ["0in", y, "0in"] });
const withWood = (p: Project, thickness: number): Project => ({
  ...p,
  stock: p.stock.map((s) => (s.id === WOOD_ID ? { ...s, thickness } : s)),
});
describe("bookmatch", () => {
  const three = boards(
    [wood("A"), wood("B"), wood("C")],
    [at("A", "0in"), at("B", "5in"), at("C", "10in")],
    [],
    {
      matchSets: [{ name: "Set", type: "bookmatch", members: ["A", "B", "C"] }],
    },
  );
  it("3 members: 3 x 3/4 + 2 x 1/8 + 6 x 1/16 = 2-7/8", () =>
    expect(solve(three, shop).nesting.boards[0]?.compositeThickness).toBe(inch(23 / 8)));
  const unequal = boards(
    [wood("A", "10in", "4in"), wood("B", "12in", "5in")],
    [at("A", "0in"), at("B", "5in")],
    [],
    {
      matchSets: [{ name: "Set", type: "bookmatch", members: ["A", "B"] }],
    },
  );
  it("unequal: board is as long and wide as the largest member", () =>
    expect(solve(unequal, shop).nesting.boards[0]?.composite).toMatchObject({
      length: inch(13),
      width: inch(5),
    }));
  it("no warning when stock is exactly as thick as the composite; warning one unit less", () => {
    const warn = (t: number) =>
      rules(withWood(unequal, t)).includes("warning:bookmatch-needs-thicker-stock");
    // 3/4 + 3/4 + 1/8 + 4/16 = 1-7/8
    expect(warn(inch(15 / 8))).toBe(false);
    expect(warn(inch(15 / 8) - 1)).toBe(true);
  });
});

describe("duplicate joint", () => {
  const h: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const b: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
  const inst: InstanceSpec[] = [
    { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
    { name: "Back", part: "Back", at: ["2in", "0in", "3/4in"], orientation: 16 },
  ];
  const j = { type: "rabbet" as const, host: "Host", guest: "Back" };
  it("control: one rabbet is clean", () => expect(rules(boards([h, b], inst, [j]))).toEqual([]));
  it("three rabbets: each repeat is reported (two diagnostics)", () => {
    const d = solve(boards([h, b], inst, [j, j, j]), shop).diagnostics.filter(
      (x) => x.rule === "duplicate-joint",
    );
    expect(d).toHaveLength(2);
  });
  it("a repeated rabbet is not cut twice in the derived guest size", () => {
    const one = boards([h, b], inst, [j]);
    const two = boards([h, b], inst, [j, j]);
    const add = (p: Project, i: number) => deriveJointCuts(p, p.joints[i]?.id ?? "").guestCutAdd;
    expect(add(two, 0)).toEqual(add(one, 0));
    expect(add(two, 1)).toEqual({ length: 0, width: 0 });
  });
});

describe("joint-host-unjoined", () => {
  const side: PartSpec = { name: "Side", length: "20in", width: "6in", thickness: "3/4in" };
  const shelf: PartSpec = { name: "Shelf", length: "8in", width: "6in", thickness: "3/4in" };
  const mk = (shelfX: string, shelfCount?: string): Project =>
    boards(
      [side, shelf],
      [
        { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
        { name: "Shelf", part: "Shelf", at: [shelfX, "0in", "5in"] },
      ],
      [{ type: "dado", host: "Side", guest: "Shelf" }],
      {
        patterns: [
          { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
          ...(shelfCount
            ? [
                {
                  source: "Shelf",
                  count: shelfCount,
                  axis: "x" as const,
                  spacing: { mode: "fixed" as const, step: "10in" },
                },
              ]
            : []),
        ],
      },
    );
  it("no warning when every copy has a shelf", () =>
    expect(rules(mk("3/4in", "2"))).not.toContain("warning:joint-host-unjoined"));
  it("no warning (only no-contact) when no copy has a shelf", () => {
    const r = rules(mk("40in"));
    expect(r).toContain("error:joint-no-contact");
    expect(r).not.toContain("warning:joint-host-unjoined");
  });
  it("carries count when several copies are bare", () => {
    const p = mk("3/4in");
    const q = { ...p, patterns: p.patterns.map((x) => ({ ...x, count: "4" })) };
    const d = solve(q, shop).diagnostics.find((x) => x.rule === "joint-host-unjoined");
    expect(d?.count).toBe(3);
  });
});

describe("planingAllowance file", () => {
  const base = boards([wood("A")], [at("A", "0in")], [], {});
  const withPlaning = (v: unknown) => {
    const o = JSON.parse(serializeProject(base));
    o.planingAllowance = v;
    return JSON.stringify(o);
  };
  it("accepts 0 and MAX_LENGTH", () => {
    expect(parseProject(withPlaning(0)).planingAllowance).toBe(0);
    expect(parseProject(withPlaning(MAX_LENGTH)).planingAllowance).toBe(MAX_LENGTH);
  });
  it("rejects MAX_LENGTH + 1, negatives, fractions, strings, null with ProjectFormatError", () => {
    for (const v of [MAX_LENGTH + 1, -1, 0.5, "1/16in", null]) {
      expect(() => parseProject(withPlaning(v)), String(v)).toThrow(ProjectFormatError);
    }
  });
  it("load -> save is byte identical", () => {
    const t = serializeProject({ ...base, planingAllowance: INCH / 8 });
    expect(serializeProject(parseProject(t))).toBe(t);
  });
});

describe("pair cap boundary", () => {
  const stacks = (n: number): Project => {
    const slab: PartSpec = { name: "Slab", length: "20in", width: "20in", thickness: "1/2in" };
    const g: PartSpec = { name: "G", length: "20in", width: "20in", thickness: "1/2in" };
    return boards(
      [slab, g],
      [
        { name: "Slab", part: "Slab", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["0in", "0in", "0in"] },
      ],
      [{ type: "dado", host: "Slab", guest: "G" }],
      {
        patterns: [
          {
            source: "Slab",
            count: String(n),
            axis: "x",
            spacing: { mode: "fixed", step: "1/64in" },
          },
          { source: "G", count: String(n), axis: "x", spacing: { mode: "fixed", step: "1/64in" } },
        ],
      },
    );
  };
  it("316 x 316 = 99,856 pairs is worked out; 317 x 317 = 100,489 is refused", () => {
    expect(rules(stacks(316))).not.toContain("error:joint-too-many-pairs");
    const refused = solve(stacks(317), shop).diagnostics.filter(
      (d) => d.rule === "joint-too-many-pairs",
    );
    expect(refused.map((d) => [d.severity, d.field])).toEqual([["error", "dado between patterns"]]);
  });
});
