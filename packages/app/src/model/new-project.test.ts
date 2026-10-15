// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3: the template, its size (outside or space to fill), its piece options and the wood become one
// new project; anything that cannot be built is refused in plain words before Create.

import { INCH, parseLength, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { defaultChoice, newProject } from "./new-project";
import { STARTER_RECORD, shopProfileFor } from "./shop-record";
import { literalFor } from "./size";
import { STOCK_IDS } from "./starter";

const bookcase = defaultChoice("bookcase", "imperial", STARTER_RECORD);

describe("newProject()", () => {
  it("makes a 36 × 72 × 12 bookcase with 4 shelves that solves without errors", () => {
    const r = newProject(bookcase, STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    const result = solve(r.edit.project, shopProfileFor(STARTER_RECORD));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // 72" × 203200 = 14_630_400 (PlacedPart.size.length is the board's long dimension, R3)
    const sides = result.placements.filter((p) => p.partName === "Side");
    expect(sides.map((s) => s.size.length)).toEqual([14_630_400, 14_630_400]);
    expect(72 * INCH).toBe(14_630_400);
    expect(result.placements.filter((p) => p.partName === "Shelf")).toHaveLength(4);
    expect(r.edit.label).toBe("New bookcase");
  });

  it('sizes the piece to a space: a 30-1/2" × 80" alcove gives a 30-1/4" × 79-7/8" bookcase', () => {
    const r = newProject(
      { ...bookcase, sizeMode: "space", w: '30-1/2"', h: '80"', gap: '1/8"' },
      STARTER_RECORD,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.outside).toEqual({ w: 6_146_800, h: 16_230_600, d: 12 * INCH }); // hand calc in space.test.ts
  });

  it("refuses an empty, zero or unreadable size with the field's name", () => {
    expect(newProject({ ...bookcase, w: "" }, STARTER_RECORD)).toEqual({
      ok: false,
      message: "Type a width.",
    });
    expect(newProject({ ...bookcase, w: '0"' }, STARTER_RECORD)).toMatchObject({
      ok: false,
      message: "Width must be more than zero.",
    });
    expect(newProject({ ...bookcase, h: "tall" }, STARTER_RECORD)).toMatchObject({ ok: false });
  });

  it("refuses a gap that is bigger than the space", () => {
    const r = newProject(
      { ...bookcase, sizeMode: "space", w: '1/4"', gap: '1/8"' },
      STARTER_RECORD,
    );
    expect(r).toEqual({ ok: false, message: "The gap is bigger than the space." });
  });

  it("reads millimetres typed into an imperial project", () => {
    const r = newProject({ ...bookcase, w: "900 mm" }, STARTER_RECORD);
    expect(r.ok).toBe(true);
  });

  it("refuses a piece that comes later", () => {
    expect(newProject({ ...bookcase, piece: "table" }, STARTER_RECORD)).toEqual({
      ok: false,
      message:
        "Kerf can't build a table yet; it's coming. Start from a blank project or a plain case in the meantime.",
    });
  });

  it("starts 'Something else' as an empty project and hands back the idea as its note", () => {
    const r = newProject(
      { ...defaultChoice("idea", "imperial", STARTER_RECORD), note: " A round dining table " },
      STARTER_RECORD,
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.structures).toEqual([]);
    expect(r.edit.project.name).toBe("New idea");
    expect(r.note).toBe("A round dining table");
  });

  it("builds the cabinet from the plain case, with or without a back", () => {
    const without = newProject(
      { ...defaultChoice("cabinet", "imperial", STARTER_RECORD), back: false },
      STARTER_RECORD,
    );
    if (!without.ok) throw new Error(without.message);
    expect(without.edit.project.structures[0]?.options.back).toBe("none");
    const withBack = newProject(
      defaultChoice("cabinet", "imperial", STARTER_RECORD),
      STARTER_RECORD,
    );
    if (!withBack.ok) throw new Error(withBack.message);
    expect(withBack.edit.project.structures[0]?.options.back).toBe("inset-rabbet");
  });

  it("uses the wood chosen for the case", () => {
    const r = newProject({ ...bookcase, wood: STOCK_IDS.walnut44 }, STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.structures[0]?.options.carcaseStock).toBe(STOCK_IDS.walnut44);
  });

  it("sizes a keepsake box by length, height and width and uses the wood for its walls", () => {
    const r = newProject(defaultChoice("box", "imperial", STARTER_RECORD), STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    const result = solve(r.edit.project, shopProfileFor(STARTER_RECORD));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.edit.project.structures[0]?.options.wallStock).toBeDefined();
  });

  it("keeps every stock the template names resolvable, with the shop's stock first", () => {
    const r = newProject(bookcase, STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    const ids = r.edit.project.stock.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, STARTER_RECORD.stock.length)).toEqual(
      STARTER_RECORD.stock.map((s) => s.id),
    );
  });

  it("types the grid sizes in a form that reads back to the same length", () => {
    for (const len of [6_146_800, 16_230_600, 36 * INCH]) {
      expect(parseLength(literalFor(len, "imperial"), "imperial")).toBe(len);
    }
  });
});
