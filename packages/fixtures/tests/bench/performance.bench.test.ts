// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Benchmarks (Charter question 3, Cut list & nesting budget): written as timing tests so they use
// the same expected-failure mechanism as every other milestone test.

import { generateStructures, nest, type Project, solve } from "@kerf/core";
import { describe, expect } from "vitest";
import { loadProject, loadShopProfile, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";

const shop = loadShopProfile();

function elapsedMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("benchmarks", () => {
  // The Build plan lists this under M4, but the whole pipeline exists from M2, so the budget is held
  // from M2 on: a regression is caught the milestone it is introduced in.
  milestone("M2", "solve the reference bookcase in under 100 ms", () => {
    const bookcase = loadProject("bookcase");
    expect(elapsedMs(() => solve(bookcase, shop))).toBeLessThan(100);
  });

  // The form is what the app solves on every edit, so generating and solving it is the budget the
  // spec states ("under 100 ms on the reference bookcase"), not only the hand-built project.
  milestone("M3", "generate and solve the reference bookcase form in under 100 ms", () => {
    const form = loadProject("bookcase", "structure");
    expect(elapsedMs(() => solve(form, shop))).toBeLessThan(100);
  });

  milestone("M3", "generate and solve a case with 6 bays of 6 shelves in under 250 ms", () => {
    const base = loadProject("bookcase", "structure");
    const structure = base.structures[0];
    const root = structure?.openings[0];
    if (!structure || !root) throw new Error("form has no opening");
    const bays: Project = {
      ...base,
      structures: [
        {
          ...structure,
          openings: [
            {
              id: root.id,
              division: { type: "bays", count: "6" },
              children: Array.from({ length: 6 }, (_, i) => ({
                id: `01K7M3Q8ZD00000000B10000${70 + i}`,
                division: { type: "shelves" as const, count: "6", spacing: "even" as const },
                children: [],
              })),
            },
          ],
        },
      ],
    };
    expect(elapsedMs(() => solve(bays, shop))).toBeLessThan(250);
  });

  milestone("M3", "generating the same project again is free (the result is reused)", () => {
    const form = loadProject("bookcase", "structure");
    const first = generateStructures(form, shop);
    expect(generateStructures(form, shop)).toBe(first);
  });

  milestone("M2", "nest 100 parts in under 1 s", () => {
    // 2 sides + top + bottom + back + 95 shelves = 100 parts.
    const hundred = withParam(loadProject("bookcase"), "shelf_count", "95");
    expect(elapsedMs(() => nest(hundred, shop))).toBeLessThan(1000);
  });
});
