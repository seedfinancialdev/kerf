// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Number fields"; ADR 015, rule 3. Values: 1in = 203200 units.

import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import {
  exactLiteral,
  explainSize,
  literalFor,
  readCount,
  readLength,
  readPosition,
  readShopLength,
  retype,
} from "./size";

const bookcase = startProject("Bookcase", "imperial").project;
const metric = startProject("Bookcase", "metric").project;

describe("readLength()", () => {
  it('reads 30" as 30 inches and keeps the text as typed', () => {
    expect(readLength('30"', bookcase)).toEqual({ ok: true, expr: '30"', value: 6_096_000 });
  });

  it("reads an expression over the project's names: depth - 1\" is 11 inches", () => {
    // depth = 12in in the Bookcase template; 12 - 1 = 11" = 2235200.
    expect(readLength('depth - 1"', bookcase)).toEqual({
      ok: true,
      expr: 'depth - 1"',
      value: 2_235_200,
    });
  });

  it('snaps to the 1/64" grid, half to even', () => {
    // 1" is 64 steps of 1/64"; 1/128" is half a step. Half-to-even keeps the even step, 64.
    expect(readLength("1in + 1in/128", bookcase)).toMatchObject({ ok: true, value: 203_200 });
  });

  it("refuses a bare number and says to add a unit", () => {
    expect(readLength("30", bookcase)).toEqual({
      ok: false,
      message: '"30" is not a length; add a unit (in, " or mm).',
    });
  });

  it("refuses a size worked out from itself", () => {
    expect(readLength('width + 1"', bookcase, "width")).toEqual({
      ok: false,
      message: "Width can't be worked out from itself.",
    });
  });

  it("refuses text that is not a size, with the engine's message", () => {
    expect(readLength("abc", bookcase)).toEqual({ ok: false, message: 'Unknown name "abc"' });
  });

  it("reads 100,000 inches, the limit itself", () => {
    // 100000 x 203200 = 20320000000 units.
    expect(readLength('100000"', bookcase)).toEqual({
      ok: true,
      expr: '100000"',
      value: 20_320_000_000,
    });
  });

  it("refuses a length beyond the 100,000 inch limit instead of throwing", () => {
    expect(readLength('100001"', bookcase)).toEqual({
      ok: false,
      message: "Length is too large: the limit is 100,000 inches",
    });
  });

  it("reads 762mm in a metric project as 762 x 8000 = 6096000 units", () => {
    expect(readLength("762mm", metric)).toEqual({ ok: true, expr: "762mm", value: 6_096_000 });
  });

  it("snaps to the 0.01 mm grid half to even in a metric project", () => {
    // One 0.01 mm step is 80 units. 0.005mm = 40 units is half a step: the even step is 0.
    expect(readLength("0.005mm", metric)).toMatchObject({ ok: true, value: 0 });
    // 0.015mm = 120 units is a step and a half: the even step is 2, so 160 units.
    expect(readLength("0.015mm", metric)).toMatchObject({ ok: true, value: 160 });
  });

  it("asks for a size when the field is empty", () => {
    expect(readLength("  ", bookcase)).toEqual({
      ok: false,
      message: 'Type a length, like 30" or 762mm.',
    });
  });
});

describe("readCount()", () => {
  it("reads 5 as five", () => {
    expect(readCount("5", bookcase)).toEqual({ ok: true, expr: "5", value: 5 });
  });

  it("refuses a length where a count belongs", () => {
    expect(readCount('5"', bookcase)).toEqual({
      ok: false,
      message: "Type a whole number, like 4.",
    });
  });

  it("reads 0 as none: an opening may be emptied of shelves", () => {
    expect(readCount("0", bookcase)).toEqual({ ok: true, expr: "0", value: 0 });
  });

  it("refuses a negative count", () => {
    expect(readCount("-1", bookcase)).toEqual({
      ok: false,
      message: "Type a whole number, like 4.",
    });
  });

  it("reads 64, the most boards of one kind a form makes (MAX_COUNT in core)", () => {
    expect(readCount("64", bookcase)).toEqual({ ok: true, expr: "64", value: 64 });
  });

  it("refuses 65, one past the most a form makes", () => {
    expect(readCount("65", bookcase)).toEqual({
      ok: false,
      message: "Type a whole number up to 64.",
    });
  });

  it("refuses a fraction of a shelf", () => {
    expect(readCount("5/2", bookcase)).toEqual({
      ok: false,
      message: "Type a whole number, like 4.",
    });
  });
});

describe("readPosition()", () => {
  it("accepts a fraction of the opening, kept as typed", () => {
    expect(readPosition("1/3", bookcase)).toEqual({ ok: true, expr: "1/3" });
  });

  it("accepts a length from the left", () => {
    expect(readPosition('12"', bookcase)).toEqual({ ok: true, expr: '12"' });
  });

  it("refuses a fraction of exactly 1: that is the opening's far face, not a place inside it", () => {
    expect(readPosition("3/3", bookcase)).toEqual({
      ok: false,
      message: 'Type a length like 12" or a fraction like 1/3.',
    });
  });

  it("refuses a fraction of 0: that is the opening's left face, not a place inside it", () => {
    expect(readPosition("0", bookcase)).toEqual({
      ok: false,
      message: 'Type a length like 12" or a fraction like 1/3.',
    });
  });

  it("passes a negative length on for the solver to report (ADR 015, known limit 13)", () => {
    expect(readPosition('-2"', bookcase)).toEqual({ ok: true, expr: '-2"' });
  });

  it("refuses a fraction of 1 or more", () => {
    expect(readPosition("4/3", bookcase)).toEqual({
      ok: false,
      message: 'Type a length like 12" or a fraction like 1/3.',
    });
  });
});

describe("exactLiteral()", () => {
  it('writes 1/8" as exactly 3.175mm', () => {
    // 25400 units ÷ 8000 per mm = 3.175 exactly.
    expect(exactLiteral(25_400)).toBe("3.175mm");
  });

  it('writes one 1/64" step as exactly 0.396875mm', () => {
    expect(exactLiteral(3_175)).toBe("0.396875mm");
  });

  it('writes -1/8" as exactly -3.175mm, keeping the sign', () => {
    // -25400 units ÷ 8000 per mm = -3.175 exactly.
    expect(exactLiteral(-25_400)).toBe("-3.175mm");
  });

  it("writes a whole number of millimetres without a decimal point", () => {
    expect(exactLiteral(80_000)).toBe("10mm");
  });
});

describe("literalFor()", () => {
  it("writes an inch value as the fraction a woodworker reads", () => {
    // 35-1/16" = 7124700 units; formatLength's own form is a valid literal (Domain model,
    // "Literals").
    expect(literalFor(7_124_700, "imperial")).toBe('35-1/16"');
  });

  it("writes a metric value exactly, never rounded to 0.1 mm", () => {
    expect(literalFor(80, "metric")).toBe("0.01mm");
  });
});

describe("readShopLength()", () => {
  const LABEL = "Roundover size";
  const ZERO = "A bit must be bigger than zero.";

  it("reads a length typed for the shop, outside any project", () => {
    // 5/16" = 5 × 203200 / 16 = 63,500.
    expect(readShopLength('5/16"', "imperial", LABEL, ZERO)).toEqual({
      ok: true,
      expr: '5/16"',
      value: 63_500,
    });
  });

  it("snaps to the grid of the units it is read in", () => {
    // 2.2 mm = 2.2 × 8000 = 17,600, on the 0.01 mm grid (80 units).
    expect(readShopLength("2.2mm", "metric", LABEL, ZERO)).toMatchObject({
      ok: true,
      value: 17_600,
    });
  });

  it("refuses zero and less with the message it is given", () => {
    expect(readShopLength('0"', "imperial", LABEL, ZERO)).toEqual({ ok: false, message: ZERO });
    expect(readShopLength('-1/4"', "imperial", LABEL, ZERO)).toEqual({ ok: false, message: ZERO });
  });

  it("knows no project's names, and says so in words that name the field", () => {
    // Task 8 review: the engine's `Unknown name "width"` says neither what is wrong nor what to type.
    expect(readShopLength("width", "imperial", LABEL, ZERO)).toEqual({
      ok: false,
      message: 'Roundover size: "width" isn\'t a length; type one like 30" or 762 mm.',
    });
  });

  it("asks for a length when nothing is typed", () => {
    expect(readShopLength(" ", "imperial", LABEL, ZERO)).toEqual({
      ok: false,
      message: 'Type a length, like 30" or 762mm.',
    });
  });
});

describe("explainSize()", () => {
  /** What a New project size field says for `text`, typed into the field called Width. */
  const said = (text: string): string => {
    const read = readLength(text, bookcase);
    if (read.ok) throw new Error(`"${text}" was read as a length`);
    return explainSize("Width", text, read.message);
  };

  it.each(["tall", "30-", "30-1/", "30#", "30 x", '36""', '1/0"'])(
    "names the field and says what to type for the half-typed or mistyped %s",
    (text) => {
      // Task 10 review: the engine's words ("Expected a value", "Unexpected character", …) say neither.
      expect(said(text)).toBe(`Width: "${text}" isn't a length; type one like 30" or 762 mm.`);
    },
  );

  it("quotes the text as typed, without the spaces around it", () => {
    expect(said(" wide ")).toBe('Width: "wide" isn\'t a length; type one like 30" or 762 mm.');
  });

  it("passes on the refusals that are already plain: a bare number, a length too large, zero", () => {
    expect(said("30")).toBe('"30" is not a length; add a unit (in, " or mm).');
    expect(said('100001"')).toBe("Length is too large: the limit is 100,000 inches");
    expect(explainSize("Width", '0"', "Width must be more than zero.")).toBe(
      "Width must be more than zero.",
    );
  });
});

describe("retype()", () => {
  it('types 30" again in millimetres, exactly and spaced as the usual sizes: 30 × 25.4 = 762 mm', () => {
    expect(retype('30"', "imperial", "metric")).toBe("762 mm");
  });

  it('types 762 mm again in inches: 762 ÷ 25.4 = 30"', () => {
    expect(retype("762 mm", "metric", "imperial")).toBe('30"');
  });

  it('types 1/8" as 3.175 mm, which is exact (1/8 × 25.4)', () => {
    expect(retype('1/8"', "imperial", "metric")).toBe("3.175 mm");
  });

  it("gives nothing for text that is not a length", () => {
    expect(retype("tall", "imperial", "metric")).toBeUndefined();
    expect(retype("30", "imperial", "metric")).toBeUndefined();
  });
});
