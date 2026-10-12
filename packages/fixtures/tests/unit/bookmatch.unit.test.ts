// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import {
  INCH,
  MAX_LENGTH,
  matchSetBoard,
  type Project,
  ProjectFormatError,
  parseProject,
  type ShopProfile,
  serializeProject,
  solve,
  validateProject,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec, WOOD_ID } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

{
  const shop = loadShopProfile();
  const inch = (n: number): number => n * INCH;
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
  const at = (name: string, y: string): InstanceSpec => ({
    name,
    part: name,
    at: ["0in", y, "0in"],
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
      expect(checked.problem).toBeInstanceOf(ProjectFormatError);
      expect(checked.problem?.path).toBe("$");
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
      expect(() => parseProject(bad)).toThrow(
        /planingAllowance: expected a value from 0 in to 100000 in/,
      );
    });
  });
}

{
  const shop = loadShopProfile();
  const inch = (n: number): number => n * INCH;
  const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);
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
      expect(matchSetBoard(solve(three, shop).nesting.boards[0])?.compositeThickness).toBe(
        inch(23 / 8),
      ));
    const unequal = boards(
      [wood("A", "10in", "4in"), wood("B", "12in", "5in")],
      [at("A", "0in"), at("B", "5in")],
      [],
      {
        matchSets: [{ name: "Set", type: "bookmatch", members: ["A", "B"] }],
      },
    );
    it("unequal: board is as long and wide as the largest member", () =>
      expect(matchSetBoard(solve(unequal, shop).nesting.boards[0])?.composite).toMatchObject({
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
}
