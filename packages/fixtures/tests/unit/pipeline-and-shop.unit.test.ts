// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import {
  buildCutList,
  deriveJointCuts,
  INCH,
  MAX_LENGTH,
  machiningSetups,
  nest,
  type Project,
  ProjectFormatError,
  parseProject,
  type ShopProfile,
  shopProblem,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

/** Asserts the call throws an error of this class whose message matches. */
const throwsA = (
  fn: () => unknown,
  cls: abstract new (...args: never[]) => Error,
  message: RegExp,
): void => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(cls);
  expect((caught as Error).message).toMatch(message);
};

describe("solving does not mutate its input", () => {
  const freeze = <T>(o: T): T => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as object)) freeze(v);
    }
    return o;
  };

  it("works on a deeply frozen project and shop", () => {
    const project = freeze(loadProject("bookcase"));
    const frozenShop = freeze(loadShopProfile());
    expect(() => solve(project, frozenShop)).not.toThrow();
    expect(solve(project, frozenShop).diagnostics.filter((d) => d.severity === "error")).toEqual(
      [],
    );
  });
});

{
  const shop = loadShopProfile();
  const inch = (n: number): number => n * INCH;
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  const hostAt: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "0in"] };
  const dadoP = (params: Record<string, string>, at: [string, string, string]): Project =>
    boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at, orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest", params }],
    );
  const ply = (name: string, l: string, w: string, extra: Partial<PartSpec> = {}): PartSpec => ({
    name,
    length: l,
    width: w,
    thickness: "3/4in",
    ...extra,
  });
  const at = (name: string, y: string, partName = name): InstanceSpec => ({
    name,
    part: partName,
    at: ["0in", y, "0in"],
  });

  describe("shop profile", () => {
    const ok = { kerf: 635000 / 5, tools: [] };
    it("a dado stack of zero width is invalid", () => {
      expect(shopProblem({ ...ok, tools: [{ type: "dadoStack", maxWidth: 0 }] })).not.toBeNull();
    });
    it("a kerf of exactly MAX_LENGTH is valid, one more is not", () => {
      expect(shopProblem({ ...ok, kerf: MAX_LENGTH })).toBeNull();
      expect(shopProblem({ ...ok, kerf: MAX_LENGTH + 1 })).not.toBeNull();
    });
    it("hand tools need a boolean dovetails setting", () => {
      expect(shopProblem({ ...ok, tools: [{ type: "handTools" }] })).not.toBeNull();
      expect(
        shopProblem({ ...ok, tools: [{ type: "handTools", dovetails: "yes" }] }),
      ).not.toBeNull();
    });
    it("a router needs both lists of bits", () => {
      expect(
        shopProblem({ ...ok, tools: [{ type: "router", straightBits: [100] }] }),
      ).not.toBeNull();
      expect(
        shopProblem({ ...ok, tools: [{ type: "router", roundoverBits: [100] }] }),
      ).not.toBeNull();
      expect(
        shopProblem({ ...ok, tools: [{ type: "router", straightBits: 5, roundoverBits: [1] }] }),
      ).not.toBeNull();
    });
    it("null is a diagnostic, not a throw", () => {
      expect(shopProblem(null)).not.toBeNull();
    });
    it("a null tool is a diagnostic, not a throw", () => {
      expect(shopProblem({ ...ok, tools: [null] })).not.toBeNull();
    });
  });

  describe("pipeline", () => {
    it("a blocked solve returns no shapes", () => {
      const p = dadoP({ depth: "3/4in" }, ["2in", "1/2in", "3/4in"]);
      const r = solve(p, shop);
      expect(r.blocked).toBe(true);
      expect(r.shapes).toEqual([]);
    });
    it("an invalid shop profile and a part too large both set blocked", () => {
      const huge = boards([ply("Huge", "100in", "10in")], [at("Huge", "0in")]);
      expect(solve(huge, shop).blocked).toBe(true);
      expect(solve(loadProject("bookcase"), { kerf: -1, tools: [] } as ShopProfile).blocked).toBe(
        true,
      );
    });
    it("an overlap between unjoined parts withholds the cut list and shapes", () => {
      const p = boards([ply("P", "4in", "4in")], [at("P1", "0in", "P"), at("P2", "0in", "P")]);
      const r = solve(p, shop);
      expect(r.diagnostics.map((x) => x.rule)).toContain("overlap");
      expect(r.cutList).toEqual({ lines: [], blocks: [] });
      expect(r.shapes).toEqual([]);
    });
    it("a project with no sheet goods still gets its dovetail setup", () => {
      const pins: PartSpec = {
        name: "Pins",
        length: "10in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const tails: PartSpec = {
        name: "Tails",
        length: "6in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const p = boards(
        [pins, tails],
        [
          { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
          { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
        ],
        [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
      );
      const r = solve(p, shop);
      expect(r.nesting.sheets).toEqual([]);
      expect(r.setups.map((s) => s.tool)).toEqual(["handTools"]);
    });
    it("the shape of a dadoed host carries its removal: x 2in-2-1/2in, y 0-6in, z 1/2in-3/4in", () => {
      const r = solve(dadoP({}, ["2in", "1/2in", "3/4in"]), shop);
      const shape = r.shapes.find((s) => s.name === "Host");
      expect(shape?.removals).toEqual([
        { kind: "box", min: [inch(2), 0, inch(0.5)], max: [inch(2.5), inch(6), inch(0.75)] },
      ]);
    });
  });

  describe("result shapes", () => {
    it("stay when only the layout fails, and are withheld when the assembly cannot be built", () => {
      const big = boards([ply("Big", "100in", "10in")], [at("Big", "0in")]);
      const tooBig = solve(big, shop);
      expect(tooBig.blocked).toBe(true);
      expect(tooBig.diagnostics.map((d) => d.rule)).toContain("part-too-large");
      expect(tooBig.shapes).toHaveLength(1);

      const broken = boards(
        [ply("A", "10in", "10in"), ply("B", "10in", "10in")],
        [at("A", "0in"), { name: "B", part: "B", at: ["1in", "1in", "0in"] }],
      );
      const overlapping = solve(broken, shop);
      expect(overlapping.diagnostics.map((d) => d.rule)).toContain("overlap");
      expect(overlapping.shapes).toEqual([]);
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
  const pins: PartSpec = {
    name: "Pins",
    length: "10in",
    width: "4in",
    thickness: "1/2in",
    stock: "wood",
  };
  const tails: PartSpec = {
    name: "Tails",
    length: "6in",
    width: "4in",
    thickness: "1/2in",
    stock: "wood",
  };
  function serializeProjectUnchecked(p: Project): string {
    return JSON.stringify(p);
  }

  describe("match sets are checked when the file is read", () => {
    const part = (name: string): PartSpec => ({
      name,
      length: "10in",
      width: "4in",
      thickness: "3/4in",
    });
    const at = (name: string, y: string): InstanceSpec => ({
      name,
      part: name,
      at: ["0in", y, "0in"],
    });

    it("rejects a member that a pattern repeats (its copies would vanish from the set)", () => {
      const p = boards([part("A"), part("B")], [at("A", "0in"), at("B", "6in")], [], {
        patterns: [{ source: "B", count: "3", axis: "y", spacing: { mode: "fixed", step: "5in" } }],
        matchSets: [{ name: "Set", type: "sameBoard", members: ["A", "B"] }],
      });
      throwsA(() => parseProject(serializeProjectUnchecked(p)), ProjectFormatError, /pattern/);
      expect(rules(p)).toContain("error:invalid-project");
    });

    it("rejects an instance that is in two match sets", () => {
      const p = boards(
        [part("A"), part("B"), part("C")],
        [at("A", "0in"), at("B", "6in"), at("C", "12in")],
        [],
        {
          matchSets: [
            { name: "One", type: "sameBoard", members: ["A", "B"] },
            { name: "Two", type: "sameBoard", members: ["B", "C"] },
          ],
        },
      );
      expect(rules(p)).toContain("error:invalid-project");
    });
  });

  describe("solving reads the validated copy", () => {
    it("ignores properties an object only inherits", () => {
      const plain = loadProject("bookcase");
      const sneaky: Project = {
        ...plain,
        joints: plain.joints.map((j, i) =>
          i === 0
            ? { ...j, params: Object.create({ depth: "1/8in" }) as Record<string, string> }
            : j,
        ),
      };
      const reference: Project = {
        ...plain,
        joints: plain.joints.map((j, i) => (i === 0 ? { ...j, params: {} } : j)),
      };
      expect(solve(sneaky, shop).cutList).toEqual(solve(reference, shop).cutList);
    });
  });

  describe("the shop profile is validated", () => {
    const bookcase = loadProject("bookcase");
    const bad: Array<[string, unknown]> = [
      ["kerf NaN", { ...shop, kerf: Number.NaN }],
      ["kerf negative", { ...shop, kerf: -635000 }],
      ["kerf fractional", { ...shop, kerf: 1.5 }],
      ["kerf missing", { tools: shop.tools }],
      ["tools missing", { kerf: shop.kerf }],
      ["a tool of an unknown type", { ...shop, tools: [{ type: "laser" }] }],
      ["a dado stack without a width", { ...shop, tools: [{ type: "dadoStack" }] }],
      ["undefined", undefined],
    ];

    it.each(bad)("solve reports invalid-shop for %s and produces no outputs", (_label, value) => {
      const result = solve(bookcase, value as ShopProfile);
      expect(result.diagnostics.map((d) => d.rule)).toContain("invalid-shop");
      expect(result.nesting.sheets).toEqual([]);
      expect(result.setups).toEqual([]);
    });

    it.each(bad)(
      "nest and machiningSetups return empty results for %s without throwing",
      (_label, value) => {
        expect(nest(bookcase, value as ShopProfile)).toEqual({
          sheets: [],
          boards: [],
          sheetCountByStock: {},
          totals: [],
        });
        expect(machiningSetups(bookcase, value as ShopProfile)).toEqual([]);
      },
    );
  });

  describe("errors block the solve", () => {
    it("emits no cut list, sheets or setups while a joint error exists", () => {
      const broken = withParam(loadProject("bookcase"), "dado_depth", "23/32in");
      const result = solve(broken, shop);
      expect(result.blocked).toBe(true);
      expect(result.cutList).toEqual({ lines: [], blocks: [] });
      expect(result.nesting.sheets).toEqual([]);
      expect(result.setups).toEqual([]);
      expect(buildCutList(broken)).toEqual({ lines: [], blocks: [] });
    });

    it("is not blocked by warnings or info", () => {
      const result = solve(loadProject("box"), shop); // has the half-pin warning
      expect(result.blocked).toBe(false);
      expect(result.cutList.blocks).toHaveLength(1);
    });

    it("a nesting error (a part larger than the sheet) is reported without blocking the cut list", () => {
      const part: PartSpec = { name: "Huge", length: "100in", width: "10in", thickness: "3/4in" };
      const p = boards([part], [{ name: "Huge", part: "Huge", at: ["0in", "0in", "0in"] }]);
      const result = solve(p, shop);
      expect(result.diagnostics.map((d) => d.rule)).toContain("part-too-large");
      expect(result.cutList.lines).toHaveLength(1);
    });
  });

  describe("wrappers", () => {
    it("never throw for bad data", () => {
      const bad = { ...loadProject("bookcase"), schemaVersion: 7 } as unknown as Project;
      expect(() => buildCutList(bad)).not.toThrow();
      expect(() => nest(bad, shop)).not.toThrow();
      expect(() => machiningSetups(bad, shop)).not.toThrow();
      expect(() => buildCutList(null as unknown as Project)).not.toThrow();
    });

    it("deriveJointCuts says so when the joint does not exist", () => {
      expect(() => deriveJointCuts(loadProject("bookcase"), "01K7M3Q8ZD00000000FFFFFFFF")).toThrow(
        RangeError,
      );
    });

    it("a failing dovetail does not also raise a spurious overlap error", () => {
      const p = boards(
        [pins, tails],
        [
          { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
          { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
        ],
        [{ type: "throughDovetail", host: "Pins", guest: "Tails", params: { tails: "10" } }],
      );
      const found = rules(p);
      expect(found).toContain("error:dovetail-narrow-tail");
      expect(found).not.toContain("error:overlap");
    });

    it("a pattern host whose joint fails is not also told it touches nothing", () => {
      const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
      const guest: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/2in" };
      const p = boards(
        [host, guest],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "G", part: "G", at: ["2in", "2in", "3/4in"], orientation: 16 },
        ],
        [{ type: "dado", host: "Host", guest: "G", params: { depth: "1in" } }],
        {
          patterns: [
            { source: "Host", count: "2", axis: "x", spacing: { mode: "fixed", step: "20in" } },
          ],
        },
      );
      const found = rules(p);
      expect(found).toContain("error:dado-too-deep");
      expect(found).not.toContain("error:joint-no-contact");
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);

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
}
