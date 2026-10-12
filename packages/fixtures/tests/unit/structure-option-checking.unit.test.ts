// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A form must say what is wrong with a setting in words a woodworker can act on, and the same
// project must always give the same answer, whatever was done to the object in between.

import {
  buildCutList,
  detachPartIn,
  generateStructures,
  generateStructuresChecked,
  type Project,
  solve,
  withoutGenerated,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const form = (): Project => loadProject("bookcase", "structure");
const boxForm = (): Project => loadProject("box", "structure");
const withOption = (p: Project, options: Record<string, string | boolean>): Project => {
  const structure = p.structures[0];
  if (!structure) throw new Error("fixture has no structure");
  return { ...p, structures: [{ ...structure, options: { ...structure.options, ...options } }] };
};
const diagnostics = (p: Project) => solve(p, shop).diagnostics;

describe("solving the same object again", () => {
  it("gives the new answer after the project was edited in place", () => {
    const project = form();
    const shelfLength = (): number | undefined =>
      buildCutList(project).lines.find((l) => l.parts.some((p) => p.name === "Shelf"))?.length;
    const before = shelfLength();
    const width = project.params.find((p) => p.name === "width");
    if (!width) throw new Error("fixture has no width");
    width.expr = "24in";
    // 24 - 2 x 23/32 = 22-9/16 visible, + 2 x 1/4 in the dados = 23-1/16 cut.
    expect(shelfLength()).toBe((203200 * (23 * 16 + 1)) / 16);
    expect(before).not.toBe(shelfLength());
  });
});

describe("the number of bays", () => {
  const bays = (count: string): Project => {
    const base = form();
    const structure = base.structures[0];
    const root = structure?.openings[0];
    if (!structure || !root) throw new Error("fixture has no opening");
    return {
      ...base,
      structures: [
        {
          ...structure,
          openings: [{ id: root.id, division: { type: "bays", count }, children: [] }],
        },
      ],
    };
  };

  it("says a count that is not a number once, as a sentence", () => {
    const found = diagnostics(bays("abc")).filter((d) => d.rule === "invalid-count");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/^The number of bays is not valid: /);
    expect(diagnostics(bays("abc")).map((d) => d.rule)).not.toContain("division-ignored");
  });

  it("says one bay divides nothing, and so does none", () => {
    expect(diagnostics(bays("1")).find((d) => d.rule === "division-ignored")?.message).toMatch(
      /One bay is the opening itself/,
    );
    expect(diagnostics(bays("0")).find((d) => d.rule === "division-ignored")?.message).toMatch(
      /zero bays/,
    );
  });
});

describe("choices the form does not know", () => {
  it("a box bottom that is neither a groove nor none is named, not guessed", () => {
    const rules = diagnostics(withOption(boxForm(), { bottom: "grove" })).map(
      (d) => `${d.severity}:${d.rule}`,
    );
    expect(rules).toContain("error:invalid-option");
  });

  it("a stock choice of the wrong type is a wrong setting, not a deleted stock", () => {
    const found = diagnostics(withOption(form(), { carcaseStock: true })).find(
      (d) => d.rule === "invalid-option",
    );
    expect(found).toMatchObject({ severity: "error" });
  });
});

describe("detaching a board whose size cannot be worked out", () => {
  it("says so instead of detaching it with its sizes still tied to the form", () => {
    const made = generateStructures(form(), shop);
    const width = made.params.find((p) => p.name === "width");
    if (!width) throw new Error("fixture has no width");
    const broken: Project = {
      ...made,
      params: made.params.map((p) => (p === width ? { ...p, expr: "abc" } : p)),
    };
    const shelf = broken.parts.find((p) => p.source?.role === "shelf");
    expect(() => detachPartIn(broken, shelf?.id ?? "")).toThrow(RangeError);
  });
});

describe("what saving keeps", () => {
  it("leaves nothing the form generates", () => {
    const stripped = withoutGenerated(generateStructures(form(), shop));
    expect(stripped.parts).toEqual([]);
  });
});

describe("settings the form does not know", () => {
  it("a setting no such form has is named, so a typo is not silent", () => {
    const rules = diagnostics(withOption(form(), { bakRabbetDepth: "3/8in" })).map(
      (d) => `${d.severity}:${d.rule}`,
    );
    expect(rules).toContain("warning:unknown-option");
  });

  it("a value that is not one of the choices lists the choices", () => {
    const found = diagnostics(withOption(form(), { back: "Applied" })).find(
      (d) => d.rule === "invalid-option",
    );
    expect(found?.message).toMatch(/none, inset-rabbet, applied/);
  });
});

describe("a roundover taken from the shop's bits", () => {
  it("says when no bit the shop owns fits, instead of making no roundover quietly", () => {
    const noBits = {
      ...shop,
      tools: shop.tools.map((t) => (t.type === "router" ? { ...t, roundoverBits: [] } : t)),
    };
    const rules = solve(withOption(form(), { shelfRoundover: "auto" }), noBits).diagnostics.map(
      (d) => `${d.severity}:${d.rule}`,
    );
    expect(rules).toContain("warning:roundover-no-bit");
  });
});

describe("generating with a shop profile", () => {
  it("rejects a shop that is not a shop profile with the shop's own error", () => {
    const bad = { ...shop, tools: "x" } as unknown as typeof shop;
    const checked = generateStructuresChecked(form(), bad);
    expect(checked.diagnostics.map((d) => d.rule)).toContain("invalid-shop");
  });
});
