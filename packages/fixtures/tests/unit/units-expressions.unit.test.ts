// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Units, rationals and expressions (Domain model v0: Units & precision, Parameter expressions).
// Milestone M1. Constant-only checks live in packages/core/src/units.test.ts and pass today.

import {
  evaluateExpression,
  formatLength,
  INCH,
  MM,
  parseLength,
  snapToGrid,
  solveModel,
} from "@kerf/core";
import { describe, expect } from "vitest";
import { loadProject, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";
import { expectRealError } from "../../src/support";

describe("parseLength: literals from the spec", () => {
  milestone("M1", '36in and 36" are 36 inches', () => {
    expect(parseLength("36in", "imperial")).toBe(36 * INCH);
    expect(parseLength('36"', "imperial")).toBe(36 * INCH);
  });

  milestone("M1", 'fractions: 3/4" and 23/32in', () => {
    expect(parseLength('3/4"', "imperial")).toBe(152400);
    expect(parseLength("23/32in", "imperial")).toBe(146050);
  });

  milestone("M1", 'mixed numbers: 1-1/2"', () => {
    expect(parseLength('1-1/2"', "imperial")).toBe(304800);
  });

  milestone("M1", "metric: 18mm is 18 x 8,000 units", () => {
    expect(parseLength("18mm", "metric")).toBe(18 * MM);
  });

  milestone("M1", "a bare number is a count or ratio, never a length", () => {
    expectRealError(() => parseLength("4", "imperial"));
  });
});

describe("formatLength: imperial display", () => {
  milestone("M1", 'reduced fractions: 23/32"', () => {
    expect(formatLength(146050, "imperial")).toBe('23/32"');
  });

  milestone("M1", 'whole inches with fractions: 34-1/2" and 34-9/16"', () => {
    expect(formatLength(34.5 * INCH, "imperial")).toBe('34-1/2"');
    expect(formatLength(34 * INCH + 9 * (INCH / 16), "imperial")).toBe('34-9/16"');
  });
});

describe("snapping", () => {
  milestone("M1", 'snaps once, rounding half to even, on the 1/64" grid', () => {
    const grid = INCH / 64;
    // Exactly half a grid step: rounds to the even step.
    expect(snapToGrid({ num: BigInt(grid), den: 2n }, "imperial")).toBe(0);
    expect(snapToGrid({ num: BigInt(grid * 3), den: 2n }, "imperial")).toBe(2 * grid);
  });

  milestone("M1", "metric grid is 0.01 mm (80 units)", () => {
    expect(snapToGrid({ num: 80n, den: 1n }, "metric")).toBe(80);
    expect(snapToGrid({ num: 81n, den: 1n }, "metric")).toBe(80);
  });
});

describe("expressions", () => {
  milestone("M1", "evaluates in exact rationals: 1in / 3 stays 203200/3", () => {
    expect(evaluateExpression("1in / 3", {})).toEqual({ num: 203200n, den: 3n });
  });

  milestone("M1", "operators, parentheses and unary minus", () => {
    expect(evaluateExpression("-(1in + 2in) * 2", {})).toEqual({ num: BigInt(-6 * INCH), den: 1n });
  });

  milestone("M1", "functions: min, max, round, floor, ceil", () => {
    expect(evaluateExpression("max(1in, 2in)", {})).toEqual({ num: BigInt(2 * INCH), den: 1n });
    expect(evaluateExpression("floor(7/2)", {})).toEqual({ num: 3n, den: 1n });
  });

  milestone("M1", "type rules: length x count = length", () => {
    expect(evaluateExpression("3in * 4", {})).toEqual({ num: BigInt(12 * INCH), den: 1n });
  });

  milestone("M1", "type rules: length / length = ratio", () => {
    expect(evaluateExpression("3in / 1in", {})).toEqual({ num: 3n, den: 1n });
  });

  milestone("M1", "type rules: length + count is an error", () => {
    expectRealError(() => evaluateExpression("36in + 4", {}));
  });

  milestone("M1", "references to parameters resolve (shelf_count, width)", () => {
    const scope = {
      width: { value: { num: BigInt(36 * INCH), den: 1n }, kind: "length" as const },
      shelf_count: { value: { num: 4n, den: 1n }, kind: "count" as const },
    };
    expect(evaluateExpression("width / shelf_count", scope)).toEqual({
      num: BigInt(9 * INCH),
      den: 1n,
    });
  });
});

describe("parameter solving", () => {
  milestone("M1", "a parameter cycle is an error naming every member", () => {
    const base = loadProject("bookcase");
    const cyclic = withParam(withParam(base, "width", "height + 1in"), "height", "width - 1in");
    const { diagnostics } = solveModel(cyclic);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    const text = errors.map((d) => d.message).join(" ");
    expect(text).toContain("width");
    expect(text).toContain("height");
  });
});
