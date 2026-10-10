// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Robustness defects from the M2 silent-failure review, each written to fail first (ADR 012:
// bad data is a diagnostic, never a crash, a hang, or an unbounded flood of messages).

import {
  buildCutList,
  deriveJointCuts,
  machiningSetups,
  nest,
  type Project,
  parseProject,
  type ShopProfile,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

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

/** `n` pin boards and `n` tail boards, each repeated 10" apart along Y: almost none touch. */
function manyCorners(n: number): Project {
  const pinsAt: InstanceSpec = {
    name: "Pins",
    part: "Pins",
    at: ["0in", "0in", "0in"],
    orientation: 1,
  };
  const tailsAt: InstanceSpec = {
    name: "Tails",
    part: "Tails",
    at: ["0in", "0in", "0in"],
    orientation: 12,
  };
  return boards(
    [pins, tails],
    [pinsAt, tailsAt],
    [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
    {
      patterns: [
        { source: "Pins", count: String(n), axis: "y", spacing: { mode: "fixed", step: "10in" } },
        { source: "Tails", count: String(n), axis: "y", spacing: { mode: "fixed", step: "10in" } },
      ],
    },
  );
}

describe("pattern-to-pattern joints", () => {
  it("does not try every host against every guest (and does not flood diagnostics)", () => {
    const started = performance.now();
    const result = solve(manyCorners(1500), shop);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(result.diagnostics.length).toBeLessThan(100);
  });

  it("reports one aggregated message for guests that touch nothing, not one per pair", () => {
    const p = manyCorners(40);
    const unmatched = withStep(p, "Tails", "11in"); // half the guests drift away from their hosts
    const found = solve(unmatched, shop).diagnostics.filter((d) => d.rule === "joint-no-contact");
    expect(found.length).toBeLessThanOrEqual(1);
  });
});

function withStep(p: Project, source: string, step: string): Project {
  const id = p.instances.find((i) => i.name === source)?.id;
  return {
    ...p,
    patterns: p.patterns.map((x) =>
      x.source === id ? { ...x, spacing: { mode: "fixed", step } } : x,
    ),
  };
}

describe("diagnostic floods", () => {
  it("bounds overlap errors when thousands of parts collapse onto one spot", () => {
    const part: PartSpec = { name: "P", length: "4in", width: "4in", thickness: "1/2in" };
    const p = boards([part], [{ name: "P", part: "P", at: ["0in", "0in", "0in"] }], [], {
      patterns: [
        { source: "P", count: "2000", axis: "z", spacing: { mode: "fixed", step: "1/1000in" } },
      ],
    });
    const result = solve(p, shop);
    expect(result.diagnostics.length).toBeLessThan(200);
    // The first few pairs are named, and the total is still told.
    const counts = result.diagnostics.filter((d) => d.rule === "overlap").map((d) => d.count ?? 1);
    expect(Math.max(...counts)).toBeGreaterThan(1000);
  });

  it("bounds dado-overlap errors and stays fast with many dados on one host", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "40in", thickness: "3/4in" };
    const guest: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/16in" };
    const p = boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["2in", "0in", "3/4in"], orientation: 16 },
      ],
      [{ type: "dado", host: "Host", guest: "G", params: { fit: "1/8in" } }],
      {
        patterns: [
          { source: "G", count: "300", axis: "y", spacing: { mode: "fixed", step: "1/8in" } },
        ],
      },
    );
    const started = performance.now();
    const result = solve(p, shop);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(result.diagnostics.length).toBeLessThan(200);
  });

  it("reports a failing dado once per joint (one for each side), not once per shelf", () => {
    const bookcase = withParam(loadProject("bookcase"), "dado_depth", "1in");
    const found = solve(bookcase, shop).diagnostics.filter((d) => d.rule === "dado-too-deep");
    expect(found).toHaveLength(2); // the right and the left side each have one dado joint
    for (const d of found) expect(d.count).toBe(4); // four shelves each
  });
});

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
    expect(() => parseProject(serializeProjectUnchecked(p))).toThrow(/pattern/);
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

/** The project as JSON, bypassing serializeProject's own validation. */
function serializeProjectUnchecked(p: Project): string {
  return JSON.stringify(p);
}

describe("solving reads the validated copy", () => {
  it("ignores properties an object only inherits", () => {
    const plain = loadProject("bookcase");
    const sneaky: Project = {
      ...plain,
      joints: plain.joints.map((j, i) =>
        i === 0 ? { ...j, params: Object.create({ depth: "1/8in" }) as Record<string, string> } : j,
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
