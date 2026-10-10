// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Fixture integrity: ordinary tests that pass at M0. They prove the golden fixtures are
// well-formed, so a milestone test cannot "fail as expected" because of a typo in a fixture.

import { type CutList, INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { inchesToUnits } from "../../src/fraction";
import {
  loadProject,
  loadShopProfile,
  projectText,
  REFERENCE_PROJECTS,
  type ReferenceProject,
  readFixtureText,
} from "../../src/index";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) numbers(v, out);
  return out;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

function pointer(root: unknown, ptr: string): unknown {
  return ptr
    .split("/")
    .slice(1)
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], root);
}

const EXPECTED_FILES: Record<ReferenceProject, string[]> = {
  bookcase: ["cutlist", "layouts", "setups", "resize", "assembly-order"],
  box: ["cutlist", "layouts", "dovetail-layout", "validation"],
};

describe.each(REFERENCE_PROJECTS)("%s fixtures", (name) => {
  for (const variant of ["project", "structure"] as const) {
    describe(`${variant}.json`, () => {
      const text = projectText(name, variant);
      const project = loadProject(name, variant);

      it("stores only integer numbers (no floats)", () => {
        for (const n of numbers(project)) expect(Number.isInteger(n)).toBe(true);
      });

      it("is canonical JSON: sorted keys, 2-space indent, trailing newline", () => {
        expect(text).toBe(`${JSON.stringify(canonical(project), null, 2)}\n`);
      });

      it("uses stable ULID ids, unique within the file", () => {
        const ids: string[] = [];
        const collect = (v: unknown) => {
          if (Array.isArray(v)) v.forEach(collect);
          else if (v && typeof v === "object") {
            for (const [k, x] of Object.entries(v)) {
              if (k === "id" && typeof x === "string") ids.push(x);
              else collect(x);
            }
          }
        };
        collect(project);
        for (const id of ids) expect(id).toMatch(ULID);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("stores intent only: no derived data", () => {
        for (const key of ["cutList", "cuts", "mesh", "removals", "layouts", "setups"]) {
          expect(text).not.toContain(`"${key}"`);
        }
        expect(project.schemaVersion).toBe(1);
      });

      it("has no dangling references", () => {
        const stock = new Set(project.stock.map((s) => s.id));
        const defs = new Set(project.parts.map((p) => p.id));
        const instances = new Set(project.instances.map((i) => i.id));
        const patterns = new Set(project.patterns.map((p) => p.id));
        for (const p of project.parts) expect(stock.has(p.stock)).toBe(true);
        for (const i of project.instances) expect(defs.has(i.def)).toBe(true);
        for (const p of project.patterns) expect(instances.has(p.source)).toBe(true);
        for (const j of project.joints) {
          expect(instances.has(j.host) || patterns.has(j.host)).toBe(true);
          expect(instances.has(j.guest) || patterns.has(j.guest)).toBe(true);
        }
        for (const m of project.matchSets)
          for (const id of m.members) expect(instances.has(id)).toBe(true);
      });
    });
  }

  describe("expected outputs", () => {
    it("has every expected file", () => {
      for (const file of EXPECTED_FILES[name]) {
        expect(() => readFixtureText(`${name}/expected/${file}.json`)).not.toThrow();
      }
    });

    it("every length equals the fraction the spec prints (_spec)", () => {
      for (const file of EXPECTED_FILES[name]) {
        const doc = JSON.parse(readFixtureText(`${name}/expected/${file}.json`)) as {
          _spec?: Record<string, string>;
        };
        for (const [ptr, text] of Object.entries(doc._spec ?? {})) {
          expect(pointer(doc, ptr), `${name}/${file} ${ptr}`).toBe(inchesToUnits(text));
        }
      }
    });

    it("expected files store only integer numbers", () => {
      for (const file of EXPECTED_FILES[name]) {
        const doc = JSON.parse(readFixtureText(`${name}/expected/${file}.json`));
        for (const n of numbers(doc)) expect(Number.isInteger(n)).toBe(true);
      }
    });

    it("cut-list stock ids exist in the project", () => {
      const project = loadProject(name);
      const stock = new Set(project.stock.map((s) => s.id));
      const cutList = JSON.parse(readFixtureText(`${name}/expected/cutlist.json`)) as CutList;
      for (const line of cutList.lines) expect(stock.has(line.stock)).toBe(true);
      for (const block of cutList.blocks)
        for (const m of block.members) expect(stock.has(m.stock)).toBe(true);
    });
  });
});

describe("spec-stated counts", () => {
  it('bookcase: 3 cut-list lines, 3 sheets (2 of 3/4", 1 of 1/4"), 3 setups', () => {
    const cutList = JSON.parse(readFixtureText("bookcase/expected/cutlist.json")) as CutList;
    expect(cutList.lines).toHaveLength(3);
    expect(cutList.lines.map((l) => l.quantity)).toEqual([2, 6, 1]);
    const layouts = JSON.parse(readFixtureText("bookcase/expected/layouts.json")) as {
      sheets: unknown[];
    };
    expect(layouts.sheets).toHaveLength(3);
    const setups = JSON.parse(readFixtureText("bookcase/expected/setups.json")) as {
      setups: Array<{ cuts: number }>;
    };
    expect(setups.setups.map((s) => s.cuts)).toEqual([12, 2, 8]);
  });

  it("box: one match-set block of 4 in order, plus the bottom", () => {
    const cutList = JSON.parse(readFixtureText("box/expected/cutlist.json")) as CutList;
    expect(cutList.lines).toHaveLength(1);
    expect(cutList.blocks).toHaveLength(1);
    expect(cutList.blocks[0]?.members.map((m) => m.name)).toEqual([
      "Front",
      "Side",
      "Back",
      "Side",
    ]);
  });

  it("bookcase project: 36 x 72 x 12 inches from parameters", () => {
    const params = Object.fromEntries(loadProject("bookcase").params.map((p) => [p.name, p.expr]));
    expect(params).toMatchObject({ width: "36in", height: "72in", depth: "12in" });
    expect(INCH).toBe(203200);
  });

  it("shop profile has a dado stack and a router with a 1/8 inch roundover bit", () => {
    const shop = loadShopProfile();
    expect(shop.kerf).toBe(INCH / 8);
    expect(shop.tools.map((t) => t.type)).toEqual(["dadoStack", "router", "handTools"]);
  });
});
