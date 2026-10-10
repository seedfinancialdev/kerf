// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Exact rational arithmetic on bigint. Domain model v0, "Units & precision": expressions
// evaluate in exact rationals and snap to the grid once, at the end.

export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Builds a reduced rational with a positive denominator. */
export function rational(num: bigint, den = 1n): Rational {
  if (den === 0n) throw new RangeError("Rational with a zero denominator");
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den);
  return { num: (sign * num) / g, den: (sign * den) / g };
}

export function fromInteger(n: number): Rational {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer: ${n}`);
  return { num: BigInt(n), den: 1n };
}

export const ZERO: Rational = { num: 0n, den: 1n };

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

/** Throws RangeError when dividing by zero; callers turn that into a field error. */
export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError("Division by zero");
  return rational(a.num * b.den, a.den * b.num);
}

export function negate(a: Rational): Rational {
  return { num: -a.num, den: a.den };
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

export function isInteger(a: Rational): boolean {
  return a.den === 1n;
}

export function isZero(a: Rational): boolean {
  return a.num === 0n;
}

export function floor(a: Rational): Rational {
  const q = a.num / a.den;
  return { num: a.num % a.den !== 0n && a.num < 0n ? q - 1n : q, den: 1n };
}

export function ceil(a: Rational): Rational {
  return negate(floor(negate(a)));
}

/** Rounds to the nearest integer; exact halves go to the even neighbour. */
export function roundHalfEven(a: Rational): Rational {
  const lower = floor(a).num;
  const twiceRemainder = 2n * (a.num - lower * a.den);
  if (twiceRemainder < a.den) return { num: lower, den: 1n };
  if (twiceRemainder > a.den) return { num: lower + 1n, den: 1n };
  return { num: lower % 2n === 0n ? lower : lower + 1n, den: 1n };
}

/** The value as a JavaScript integer. Throws RangeError unless it is an exact safe integer. */
export function toSafeInteger(a: Rational): number {
  if (a.den !== 1n) throw new RangeError("Not an integer");
  const n = Number(a.num);
  if (!Number.isSafeInteger(n)) throw new RangeError("Integer outside the safe range");
  return n;
}
