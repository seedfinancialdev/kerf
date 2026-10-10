// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { rational } from "../rational";
import { INCH, MM } from "../units";
import { ExpressionError } from "./errors";
import { evaluateQuantity } from "./evaluate";
import { tokenize } from "./lexer";
import { parseExpression, partKey, referencesOf, slug, stockKey } from "./parser";

const value = (source: string, scope = {}) => evaluateQuantity(source, scope);
const inches = (n: number, den = 1) => rational(BigInt(n * INCH), BigInt(den));

describe("literals", () => {
  it.each([
    ["36in", inches(36)],
    ['36"', inches(36)],
    ['3/4"', inches(3, 4)],
    ["23/32in", inches(23, 32)],
    ['1-1/2"', inches(3, 2)],
    ["18mm", rational(BigInt(18 * MM))],
    ["12.5mm", rational(BigInt(25 * MM), 2n)],
  ])("%s is an exact length", (source, expected) => {
    expect(value(source)).toEqual({ value: expected, kind: "length" });
  });

  it("a bare integer is a count and a decimal is a ratio", () => {
    expect(value("4")).toEqual({ value: rational(4n), kind: "count" });
    expect(value("0.25")).toEqual({ value: rational(1n, 4n), kind: "ratio" });
  });

  it("a fraction without a unit is a division, not a length", () => {
    expect(value("3/4")).toEqual({ value: rational(3n, 4n), kind: "ratio" });
  });

  it("1-1/2 without a unit is a subtraction", () => {
    expect(value("1-1/2")).toEqual({ value: rational(1n, 2n), kind: "ratio" });
  });

  it("rejects a zero denominator and stray characters", () => {
    expect(() => tokenize("1/0in")).toThrow(ExpressionError);
    expect(() => tokenize("3 # 4")).toThrow(ExpressionError);
  });
});

describe("type rules", () => {
  it("length ± length = length, length × count = length, length ÷ length = ratio", () => {
    expect(value("1in + 2in").kind).toBe("length");
    expect(value("3in * 4").kind).toBe("length");
    expect(value("4 * 3in").kind).toBe("length");
    expect(value("3in / 1in")).toEqual({ value: rational(3n), kind: "ratio" });
  });

  it('keeps 3/4" / 3 exact', () => {
    expect(value('3/4" / 3')).toEqual({ value: inches(1, 4), kind: "length" });
  });

  it.each(["1in + 2", "1in * 1in", "2 / 1in", "1in - 4"])("%s is an error", (source) => {
    expect(() => value(source)).toThrow(ExpressionError);
  });

  it("reports division by zero on the field", () => {
    expect(() => value("1in / 0")).toThrow(/zero/);
  });

  it("reports the position of an error", () => {
    try {
      value("1in + (2in *)");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      expect((error as ExpressionError).position).toBe(12);
    }
  });
});

describe("functions", () => {
  it("min and max work on lengths and on scalars", () => {
    expect(value("min(3in, 1in, 2in)").value).toEqual(inches(1));
    expect(value("max(2, 1/2)").kind).toBe("ratio");
  });

  it("round, floor and ceil return counts", () => {
    expect(value("round(5/2)")).toEqual({ value: rational(2n), kind: "count" });
    expect(value("floor(7/2)").value).toEqual(rational(3n));
    expect(value("ceil(7/2)").value).toEqual(rational(4n));
    expect(value('round(4"/1-1/2")').value).toEqual(rational(3n));
  });

  it("round on a length is an error", () => {
    expect(() => value("round(1in)")).toThrow(ExpressionError);
  });

  it("an unknown function is an error", () => {
    expect(() => value("sqrt(4)")).toThrow(/Unknown function/);
  });
});

describe("references", () => {
  it("normalizes part and stock keys", () => {
    expect(
      referencesOf(parseExpression('Side.thickness + stock["3/4 plywood"].thickness')),
    ).toEqual([partKey("Side", "thickness"), stockKey("3/4 plywood", "thickness")]);
    expect(slug("Top / Bottom")).toBe("top_bottom");
  });

  it("resolves from the scope and reports unknown names", () => {
    const scope = { width: { value: inches(36), kind: "length" as const } };
    expect(value("width / 2", scope).value).toEqual(inches(18));
    expect(() => value("depth", scope)).toThrow(/Unknown name "depth"/);
  });

  it("lists each reference once, in first-use order", () => {
    expect(referencesOf(parseExpression("b + a + b * c"))).toEqual(["b", "a", "c"]);
  });
});

describe("syntax errors", () => {
  it.each(["", "   ", "1in +", "(1in", "1in )", "stock[3]"])("%j is rejected", (source) => {
    expect(() => parseExpression(source)).toThrow(ExpressionError);
  });
});
