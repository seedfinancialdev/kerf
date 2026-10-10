// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Hardening: precedence, the spec's strict type rules, hostile input and limits.

import { describe, expect, it } from "vitest";
import { rational } from "../rational";
import { INCH } from "../units";
import { ExpressionError } from "./errors";
import { evaluateQuantity } from "./evaluate";
import { parseExpression, referencesOf, stockKey } from "./parser";

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

const inches = (n: number) => rational(BigInt(n * INCH));
const evalValue = (source: string, scope = {}) => evaluateQuantity(source, scope).value;

describe("precedence and associativity", () => {
  it.each([
    ["10in - 3in - 2in", inches(5)],
    ["12in / 2 / 3", inches(2)],
    ["1in + 2in * 3", inches(7)],
    ["2 * 3in + 1in", inches(7)],
    ["-2in * 3", inches(-6)],
    ["--1in", inches(1)],
    ["2in * (1 + 2)", inches(6)],
  ])("%s", (source, expected) => {
    expect(evalValue(source)).toEqual(expected);
  });
});

describe("the spec's type rules are strict", () => {
  it("length × count and length ÷ count are lengths", () => {
    expect(evaluateQuantity("2in * 3", {}).kind).toBe("length");
    expect(evaluateQuantity("3 * 2in", {}).kind).toBe("length");
    expect(evaluateQuantity("6in / 3", {}).kind).toBe("length");
  });

  it.each([
    "1in * 0.5",
    "0.5 * 1in",
    "1in * (1in / 2in)",
    "1in / 0.5",
    "1in / (1in / 2in)",
    "1in + 0.5",
    "1in - 2",
  ])("%s is an error", (source) => {
    expect(() => evaluateQuantity(source, {})).toThrow(ExpressionError);
  });

  it("counts and ratios combine freely", () => {
    expect(evaluateQuantity("2 + 1/2", {}).kind).toBe("ratio");
    expect(evaluateQuantity("2 * 3", {}).kind).toBe("count");
  });
});

describe("names are never looked up on the object prototype", () => {
  it.each(["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"])("%s", (name) => {
    throwsA(() => evaluateQuantity(name, {}), ExpressionError, /Unknown name/);
    expect(() => evaluateQuantity(`-${name} * 2in`, {})).toThrow(ExpressionError);
  });
});

describe("limits turn hostile input into ExpressionError, never a crash", () => {
  it("rejects expressions nested too deeply", () => {
    expect(() => parseExpression(`${"(".repeat(200)}1${")".repeat(200)}`)).toThrow(
      /too deeply nested/,
    );
    throwsA(() => parseExpression(`${"-".repeat(200)}1`), ExpressionError, /too deeply nested/);
  });

  it("accepts ordinary nesting", () => {
    expect(evalValue(`${"(".repeat(20)}1${")".repeat(20)}`)).toEqual(rational(1n));
  });

  it("rejects very long expressions", () => {
    throwsA(() => parseExpression(Array(100000).fill("1").join("+")), ExpressionError, /too long/);
  });

  it("rejects numbers that grow without bound", () => {
    const source = Array(60).fill("99999999999").join("*");
    throwsA(() => evaluateQuantity(source, {}), ExpressionError, /too large/);
  });
});

describe("string names", () => {
  it('supports a quote inside a stock name: stock["3/4\\" Baltic birch"]', () => {
    const node = parseExpression('stock["3/4\\" Baltic birch"].thickness');
    expect(referencesOf(node)).toEqual([stockKey('3/4" Baltic birch', "thickness")]);
  });

  it("rejects an unterminated name, a non-string name and a missing bracket", () => {
    for (const bad of [
      'stock["x',
      "stock[3]",
      'stock["x".thickness',
      'stock["x"]',
      'stock["x"].',
    ]) {
      expect(() => parseExpression(bad)).toThrow(ExpressionError);
    }
  });
});

describe("literals and syntax", () => {
  it("allows a space between a number and in / mm", () => {
    expect(evalValue("36 in")).toEqual(inches(36));
    expect(evaluateQuantity("18 mm", {}).kind).toBe("length");
  });

  it("rejects a zero denominator inside a mixed number", () => {
    expect(() => parseExpression("1-1/0in")).toThrow(ExpressionError);
  });

  it("checks function arguments", () => {
    for (const bad of ["round(1, 2)", "min()", "min(1in, 2)", "max(1, 1in)", "round(1in)"]) {
      expect(() => evaluateQuantity(bad, {})).toThrow(ExpressionError);
    }
  });

  it("floor, ceil and round on negatives", () => {
    expect(evalValue("floor(-7/2)")).toEqual(rational(-4n));
    expect(evalValue("ceil(-7/2)")).toEqual(rational(-3n));
    expect(evalValue("round(-5/2)")).toEqual(rational(-2n));
  });
});
