// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3: the template, its size (outside or space to fill), its piece options and the wood become one
// new project; anything that cannot be built is refused in plain words before Create.

import { INCH, MM, parseLength, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import {
  defaultChoice,
  formOf,
  newProject,
  type PieceId,
  pieceFor,
  woodOffered,
} from "./new-project";
import { STARTER_RECORD, shopProfileFor } from "./shop-record";
import { literalFor } from "./size";
import { STARTER_STOCK, STOCK_IDS } from "./starter";

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

  it("refuses an empty or zero size, naming the field it belongs to", () => {
    expect(newProject({ ...bookcase, w: "" }, STARTER_RECORD)).toEqual({
      ok: false,
      message: "Type a width.",
      field: "w",
    });
    expect(newProject({ ...bookcase, w: '0"' }, STARTER_RECORD)).toEqual({
      ok: false,
      message: "Width must be more than zero.",
      field: "w",
    });
  });

  it("refuses a gap that is bigger than the space", () => {
    const r = newProject(
      { ...bookcase, sizeMode: "space", w: '1/4"', gap: '1/8"' },
      STARTER_RECORD,
    );
    expect(r).toEqual({ ok: false, message: "The gap is bigger than the space.", field: "gap" });
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

  it("sizes a box by length, height and width", () => {
    // Walnut 4/4 walls are 1/2" thick (Tw). Dovetailed corners (the default) run the front and back the full
    // length: Front, Back = 12" long × 6" wide. Sides = depth 8" long × 6" wide. Bottom (box.ts seatBottom) =
    // (L − 2Tw) × (D − 2Tw) = 11" × 7", cut from 1/4" plywood.
    const choice = {
      ...defaultChoice("box", "imperial", STARTER_RECORD),
      wood: STOCK_IDS.walnut44,
    };
    const r = newProject(choice, STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    const result = solve(r.edit.project, shopProfileFor(STARTER_RECORD));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const sizeOf = (name: string) =>
      result.placements.filter((p) => p.partName === name).map((p) => p.size);
    const wall = (length: number, width: number) => ({ length, width, thickness: INCH / 2 });
    expect(sizeOf("Front")).toEqual([wall(12 * INCH, 6 * INCH)]);
    expect(sizeOf("Back")).toEqual([wall(12 * INCH, 6 * INCH)]);
    expect(sizeOf("Side")).toEqual([wall(8 * INCH, 6 * INCH), wall(8 * INCH, 6 * INCH)]);
    expect(sizeOf("Bottom")).toEqual([{ length: 11 * INCH, width: 7 * INCH, thickness: INCH / 4 }]);
  });

  it("keeps the template's stock resolvable when the shop has none of it", () => {
    const withoutQuarter = {
      ...STARTER_RECORD,
      stock: STARTER_STOCK.filter((x) => x.id !== STOCK_IDS.plywood14),
    };
    const r = newProject(defaultChoice("bookcase", "imperial", withoutQuarter), withoutQuarter);
    if (!r.ok) throw new Error(r.message);
    const project = r.edit.project;
    const ids = project.stock.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(project.structures[0]?.options.backStock);
    expect(ids.slice(0, withoutQuarter.stock.length)).toEqual(
      withoutQuarter.stock.map((x) => x.id),
    );
    const result = solve(project, shopProfileFor(withoutQuarter));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("refuses wood the shop does not stock", () => {
    expect(newProject({ ...bookcase, wood: "NOT-A-STOCK" }, STARTER_RECORD)).toEqual({
      ok: false,
      message: "That wood is not in your shop's stock; pick one from the list.",
      field: "wood",
    });
  });

  it("refuses a negative gap", () => {
    expect(newProject({ ...bookcase, sizeMode: "space", gap: '-1/8"' }, STARTER_RECORD)).toEqual({
      ok: false,
      message: "The gap can't be less than zero.",
      field: "gap",
    });
  });

  it("refuses a space whose height alone is used up by the gap", () => {
    // 1/16" high with a 1/16" gap at the top leaves 0 height, though the width (36") is fine
    const r = newProject(
      { ...bookcase, sizeMode: "space", h: '1/16"', gap: '1/16"' },
      STARTER_RECORD,
    );
    expect(r).toEqual({ ok: false, message: "The gap is bigger than the space.", field: "gap" });
  });

  it("says which field cannot be read and what to type there", () => {
    expect(newProject({ ...bookcase, h: "tall" }, STARTER_RECORD)).toEqual({
      ok: false,
      message: 'Height: "tall" isn\'t a length; type one like 30" or 762 mm.',
      field: "h",
    });
  });

  it('names the project after the piece (design spec §3: a bookcase is named "Bookcase")', () => {
    const named = (piece: PieceId): string => {
      const r = newProject(defaultChoice(piece, "imperial", STARTER_RECORD), STARTER_RECORD);
      if (!r.ok) throw new Error(r.message);
      return r.edit.project.name;
    };
    const pieces: PieceId[] = ["bookcase", "cabinet", "box", "plainCase", "plainBox"];
    expect(pieces.map(named)).toEqual(["Bookcase", "Cabinet", "Box", "Plain case", "Plain box"]);
  });

  it('stores 900 mm in an imperial project on the 1/64" grid', () => {
    // 900 mm = 7_200_000 units; 1/64" = 3_175 units; 7_200_000 / 3_175 = 2267.7 → 2268 steps = 7_200_900
    const r = newProject({ ...bookcase, w: "900 mm" }, STARTER_RECORD);
    if (!r.ok) throw new Error(r.message);
    const width = r.edit.project.params.find((p) => p.name === "width");
    expect(parseLength(width?.expr ?? "", "imperial")).toBe(7_200_900);
  });

  describe("in a metric project", () => {
    const metric = defaultChoice("bookcase", "metric", STARTER_RECORD);

    it("defaults to the 18 mm plywood, the thickest wood on the 0.01 mm grid", () => {
      expect(metric.wood).toBe(STOCK_IDS.plywood18mm);
    });

    it("offers only wood on the 0.01 mm grid, with the metric starter stock", () => {
      // 3/4 plywood is 23/32" = 146_050 units = 1825.6 steps of 80: off the grid
      const ids = woodOffered("metric", STARTER_RECORD).map((x) => x.id);
      expect(ids).toEqual([STOCK_IDS.plywood14, STOCK_IDS.walnut44, STOCK_IDS.plywood18mm]);
      expect(woodOffered("imperial", STARTER_RECORD).map((x) => x.id)).toEqual(
        STARTER_STOCK.map((x) => x.id),
      );
    });

    it("refuses the 3/4 plywood in plain words", () => {
      expect(newProject({ ...metric, wood: STOCK_IDS.plywood34 }, STARTER_RECORD)).toEqual({
        ok: false,
        message: "That wood is not in your shop's stock; pick one from the list.",
        field: "wood",
      });
    });

    it("builds a bookcase that solves without errors", () => {
      const r = newProject(metric, STARTER_RECORD);
      if (!r.ok) throw new Error(r.message);
      const result = solve(r.edit.project, shopProfileFor(STARTER_RECORD));
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });
  });

  it("types the grid sizes in a form that reads back to the same length", () => {
    for (const len of [6_146_800, 16_230_600, 36 * INCH]) {
      expect(parseLength(literalFor(len, "imperial"), "imperial")).toBe(len);
    }
  });

  it("types metric sizes in a form that reads back to the same length", () => {
    for (const len of [894 * MM, 100_000]) {
      // 100_000 units = 12.5 mm
      expect(parseLength(literalFor(len, "metric"), "metric")).toBe(len);
    }
  });
});

describe("the History label", () => {
  it("names the piece, not the template it is built from", () => {
    const label = (piece: PieceId): string => {
      const r = newProject(defaultChoice(piece, "imperial", STARTER_RECORD), STARTER_RECORD);
      if (!r.ok) throw new Error(r.message);
      return r.edit.label;
    };
    const pieces: PieceId[] = ["cabinet", "box", "plainCase"];
    expect(pieces.map(label)).toEqual(["New cabinet", "New box", "New plain case"]);
  });
});

describe("pieceFor()", () => {
  it("finds a piece of the gallery or the blanks by its id", () => {
    expect(pieceFor("cabinet").name).toBe("Cabinet");
    expect(pieceFor("plainBox").name).toBe("Plain box");
  });

  it("refuses an id that names no piece", () => {
    expect(() => pieceFor("rocket" as PieceId)).toThrow(RangeError);
  });
});

describe("formOf()", () => {
  it("builds the bookcase, cabinet and plain case as cases, the box and plain box as boxes", () => {
    const pieces: PieceId[] = ["bookcase", "cabinet", "plainCase", "box", "plainBox"];
    expect(pieces.map(formOf)).toEqual(["case", "case", "case", "box", "box"]);
  });

  it("gives no form for an empty project, an idea, or a piece that comes later", () => {
    const pieces: PieceId[] = ["empty", "idea", "table", "dresser"];
    expect(pieces.map(formOf)).toEqual([null, null, null, null]);
  });
});
