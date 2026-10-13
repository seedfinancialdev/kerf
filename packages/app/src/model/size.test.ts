// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Number fields"; ADR 015, rule 3. Values: 1in = 203200 units.

import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { exactLiteral, readCount, readLength, readPosition } from "./size";

const bookcase = startProject("Bookcase", "imperial").project;

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
    // 1/128" is half a grid step: rounds to the even step, 0... so 1" + 1/128" → 1".
    expect(readLength("1in + 1in/128", bookcase)).toMatchObject({ ok: true, value: 203_200 });
  });

  it("refuses a bare number and says to add a unit", () => {
    expect(readLength("30", bookcase)).toEqual({
      ok: false,
      message: '"30" is not a length; add a unit (in, " or mm)',
    });
  });

  it("refuses a size worked out from itself", () => {
    expect(readLength('width + 1"', bookcase, "width")).toEqual({
      ok: false,
      message: "Width can't be worked out from itself.",
    });
  });

  it("refuses text that is not a size, with the engine's message", () => {
    const r = readLength("abc", bookcase);
    expect(r.ok).toBe(false);
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

  it("writes a whole number of millimetres without a decimal point", () => {
    expect(exactLiteral(80_000)).toBe("10mm");
  });
});
