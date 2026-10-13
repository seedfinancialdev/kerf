// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "6. The build plan": "Machining by setup … Example: 'Dado stack 23/32", 1/4"
// deep: 12 cuts.'" Cut list & nesting: bookcase totals 3 sheets.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { cutLineText, setupText, totalsText } from "./plan-text";

const project = startProject("Bookcase", "imperial").project;
const result = solve(project, loadShopProfile());

describe("setupText()", () => {
  it("writes the first bookcase setup the way the spec's example does", () => {
    const first = result.setups[0];
    if (!first) throw new Error("no first setup");
    // Shelf dados (8) + top/bottom end rabbets (4) share 23/32 × 1/4: 12 cuts.
    expect(setupText(first, "imperial")).toBe('Dado stack, 23/32" wide, 1/4" deep: 12 cuts');
  });
});

describe("cutLineText()", () => {
  it("shows the merged line's parts, cut size and visible size", () => {
    const line = result.cutList.lines[1];
    if (!line) throw new Error("no second line");
    expect(cutLineText(line, project)).toEqual({
      parts: "Top, Bottom, Shelf × 4",
      stock: "3/4 plywood",
      cut: '35-1/16" × 11-3/4" × 23/32"',
      visible: '34-9/16" × 11-3/4"',
    });
  });
});

describe("totalsText()", () => {
  it("says the bookcase needs 3 sheets in total, the first plywood among them", () => {
    const sheets = result.nesting.totals.reduce((n, t) => n + (t.sheets ?? 0), 0);
    expect(sheets).toBe(3);
    const first = result.nesting.totals[0];
    if (!first) throw new Error("no totals");
    expect(totalsText(first, project)).toMatch(/^3\/4 plywood: \d+ sheets?$/);
  });
});
