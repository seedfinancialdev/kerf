// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add,
  ceil,
  compare,
  div,
  floor,
  fromInteger,
  mul,
  negate,
  type Rational,
  rational,
  roundHalfEven,
  sub,
  toSafeInteger,
} from "./rational";

const r = (num: number, den = 1): Rational => rational(BigInt(num), BigInt(den));

describe("rational", () => {
  it("reduces and keeps the denominator positive", () => {
    expect(rational(6n, -4n)).toEqual({ num: -3n, den: 2n });
    expect(rational(0n, 7n)).toEqual({ num: 0n, den: 1n });
  });

  it("rejects a zero denominator and division by zero", () => {
    expect(() => rational(1n, 0n)).toThrow(RangeError);
    expect(() => div(r(1), r(0))).toThrow(RangeError);
  });

  it("does exact arithmetic: 1/3 + 1/6 = 1/2", () => {
    expect(add(r(1, 3), r(1, 6))).toEqual(r(1, 2));
    expect(sub(r(1, 2), r(1, 3))).toEqual(r(1, 6));
    expect(mul(r(2, 3), r(3, 4))).toEqual(r(1, 2));
    expect(div(r(1, 2), r(1, 4))).toEqual(r(2));
  });

  it("floors and ceils toward the correct side for negatives", () => {
    expect(floor(r(7, 2))).toEqual(r(3));
    expect(floor(r(-7, 2))).toEqual(r(-4));
    expect(ceil(r(7, 2))).toEqual(r(4));
    expect(ceil(r(-7, 2))).toEqual(r(-3));
  });

  it("rounds exact halves to the even neighbour", () => {
    expect(roundHalfEven(r(1, 2))).toEqual(r(0));
    expect(roundHalfEven(r(3, 2))).toEqual(r(2));
    expect(roundHalfEven(r(5, 2))).toEqual(r(2));
    expect(roundHalfEven(r(-1, 2))).toEqual(r(0));
    expect(roundHalfEven(r(-3, 2))).toEqual(r(-2));
    expect(roundHalfEven(r(7, 3))).toEqual(r(2));
  });

  it("converts only exact safe integers to numbers", () => {
    expect(toSafeInteger(r(42))).toBe(42);
    expect(() => toSafeInteger(r(1, 2))).toThrow(RangeError);
    expect(() => fromInteger(0.5)).toThrow(RangeError);
  });

  it("compares by value", () => {
    expect(compare(r(1, 3), r(2, 6))).toBe(0);
    expect(compare(r(1, 3), r(1, 2))).toBe(-1);
    expect(compare(r(3), r(5, 2))).toBe(1);
  });

  describe("properties", () => {
    const small = fc.integer({ min: -1000, max: 1000 });
    const nonZero = small.filter((n) => n !== 0);
    const rat = fc.tuple(small, nonZero).map(([n, d]) => r(n, d));

    it("add and sub are inverses; mul and div are inverses", () => {
      fc.assert(
        fc.property(rat, rat, (a, b) => {
          expect(sub(add(a, b), b)).toEqual(a);
          if (b.num !== 0n) expect(div(mul(a, b), b)).toEqual(a);
        }),
      );
    });

    it("negate twice is the identity; floor <= value <= ceil", () => {
      fc.assert(
        fc.property(rat, (a) => {
          expect(negate(negate(a))).toEqual(a);
          expect(compare(floor(a), a)).toBeLessThanOrEqual(0);
          expect(compare(ceil(a), a)).toBeGreaterThanOrEqual(0);
        }),
      );
    });

    it("roundHalfEven is within one half of the value", () => {
      fc.assert(
        fc.property(rat, (a) => {
          const diff = sub(a, roundHalfEven(a));
          const magnitude = diff.num < 0n ? negate(diff) : diff;
          expect(compare(magnitude, r(1, 2))).toBeLessThanOrEqual(0);
        }),
      );
    });
  });
});
