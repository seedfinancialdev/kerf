// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Lengths: parsing, display and grid snapping (Domain model v0, "Units & precision").

import { ExpressionError } from "./expr/errors";
import { evaluateQuantity } from "./expr/evaluate";
import { div, type Rational, rational, roundHalfEven, toSafeInteger } from "./rational";
import type { Len } from "./types";
import { INCH, MM } from "./units";

export type UnitSystem = "imperial" | "metric";

const IMPERIAL_GRID = INCH / 64; // 1/64"  = 3,175 units
const METRIC_GRID = MM / 100; // 0.01 mm = 80 units

/** The project grid, in internal units. */
export function gridSize(units: UnitSystem): Len {
  return units === "imperial" ? IMPERIAL_GRID : METRIC_GRID;
}

/** Snaps an exact value to the project grid, once, rounding half to even. */
export function snapToGrid(value: Rational, units: UnitSystem): Len {
  const grid = gridSize(units);
  const steps = roundHalfEven(div(value, rational(BigInt(grid))));
  return toSafeInteger(steps) * grid;
}

/**
 * Reads a length such as `3/4"`, `1-1/2in` or `18mm` (or any expression that evaluates to a
 * length) and snaps it to the grid. A bare number is a count, never a length.
 */
export function parseLength(source: string, units: UnitSystem): Len {
  const result = evaluateQuantity(source, {});
  if (result.kind !== "length") {
    throw new ExpressionError(
      `"${source.trim()}" is not a length; add a unit (in, " or mm)`,
      source,
      0,
    );
  }
  return snapToGrid(result.value, units);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Shop-style display. Imperial: reduced fractions, whole inches with fractions ("34-9/16\"");
 * lengths between grid lines show the nearest 1/64". Metric: millimetres to 0.1.
 */
export function formatLength(len: Len, units: UnitSystem): string {
  const sign = len < 0 ? "-" : "";
  const magnitude = BigInt(Math.abs(len));

  if (units === "metric") {
    const tenths = toSafeInteger(roundHalfEven(rational(magnitude, BigInt(MM / 10))));
    return `${sign}${Math.trunc(tenths / 10)}.${tenths % 10} mm`;
  }

  const sixtyFourths = toSafeInteger(roundHalfEven(rational(magnitude, BigInt(IMPERIAL_GRID))));
  const whole = Math.trunc(sixtyFourths / 64);
  const remainder = sixtyFourths % 64;
  if (remainder === 0) return `${sign}${whole}"`;
  const divisor = gcd(remainder, 64);
  const fraction = `${remainder / divisor}/${64 / divisor}`;
  return whole === 0 ? `${sign}${fraction}"` : `${sign}${whole}-${fraction}"`;
}
