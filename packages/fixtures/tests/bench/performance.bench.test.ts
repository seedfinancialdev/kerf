// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Benchmarks (Charter question 3, Cut list & nesting budget): written as timing tests so they use
// the same expected-failure mechanism as every other milestone test.

import { nest, solve } from "@kerf/core";
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
  milestone("M4", "solve the reference bookcase in under 100 ms", () => {
    const bookcase = loadProject("bookcase");
    expect(elapsedMs(() => solve(bookcase, shop))).toBeLessThan(100);
  });

  milestone("M2", "nest 100 parts in under 1 s", () => {
    // 2 sides + top + bottom + back + 95 shelves = 100 parts.
    const hundred = withParam(loadProject("bookcase"), "shelf_count", "95");
    expect(elapsedMs(() => nest(hundred, shop))).toBeLessThan(1000);
  });
});
