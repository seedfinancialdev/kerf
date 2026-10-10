// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ExpressionError } from "./expr/errors";
import { formatLength, gridSize, parseLength, snapToGrid } from "./length";
import { rational } from "./rational";
import { INCH, MM } from "./units";

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

describe("grid", () => {
  it("is 1/64 inch or 0.01 mm", () => {
    expect(gridSize("imperial")).toBe(3175);
    expect(gridSize("metric")).toBe(80);
  });

  it("snaps once, half to even", () => {
    expect(snapToGrid(rational(3175n, 2n), "imperial")).toBe(0);
    expect(snapToGrid(rational(9525n, 2n), "imperial")).toBe(6350);
    expect(snapToGrid(rational(81n), "metric")).toBe(80);
  });
});

describe("parseLength", () => {
  it("reads lengths and snaps them to the project grid", () => {
    expect(parseLength('23/32"', "imperial")).toBe(146050);
    expect(parseLength("18mm", "metric")).toBe(18 * MM);
    // 12.345 mm = 98,760 units = 1234.5 grid steps: the tie goes to the even step, 1234.
    expect(parseLength("12.345mm", "metric")).toBe(1234 * 80);
  });

  it("rejects a bare number", () => {
    throwsA(() => parseLength("4", "imperial"), ExpressionError, /not a length/);
  });
});

describe("formatLength", () => {
  it.each([
    [0, '0"'],
    [146050, '23/32"'],
    [36 * INCH, '36"'],
    [(INCH * 69) / 2, '34-1/2"'],
    [-INCH / 2, '-1/2"'],
    [INCH / 64, '1/64"'],
  ])("%d is %s", (len, text) => {
    expect(formatLength(len, "imperial")).toBe(text);
  });

  it("formats metric to 0.1 mm", () => {
    expect(formatLength(18 * MM, "metric")).toBe("18.0 mm");
    expect(formatLength(12.5 * MM, "metric")).toBe("12.5 mm");
    expect(formatLength(-MM / 2, "metric")).toBe("-0.5 mm");
  });

  it("round-trips every 1/64 inch grid value", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 64 * 200 }), (sixtyFourths) => {
        const len = sixtyFourths * (INCH / 64);
        expect(parseLength(formatLength(len, "imperial"), "imperial")).toBe(len);
      }),
    );
  });
});

describe("range and display edge cases", () => {
  it("rejects lengths beyond the supported range instead of returning an unsafe number", () => {
    throwsA(() => parseLength("100000000000in", "imperial"), ExpressionError, /too large/);
    throwsA(() => parseLength("-100000000000in", "imperial"), ExpressionError, /too large/);
    expect(() => snapToGrid(rational(10n ** 30n), "imperial")).toThrow(RangeError);
  });

  it("accepts a very long but supported length", () => {
    expect(parseLength("1000in", "imperial")).toBe(1000 * INCH);
  });

  it("never prints a negative zero", () => {
    expect(formatLength(-1, "imperial")).toBe('0"');
    expect(formatLength(-1, "metric")).toBe("0.0 mm");
  });

  it("reads back what it prints, including metric with a space before the unit", () => {
    expect(parseLength(formatLength(18 * MM, "metric"), "metric")).toBe(18 * MM);
    expect(parseLength(formatLength(12.5 * MM, "metric"), "metric")).toBe(12.5 * MM);
  });
});
