// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "4. Joinery from your shop": "Shelves get dados if you own a dado stack or a
// straight bit; otherwise the app shows what you'd need." Example wording, "Machining by setup":
// "Dado stack 23/32", 1/4" deep".

import { type JointSummary, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { joineryRows } from "./joinery";

const bookcase = startProject("Bookcase", "imperial").project;

describe("joineryRows()", () => {
  it("describes the shelves' dados and says the dado stack cuts them", () => {
    const rows = joineryRows(solve(bookcase, loadShopProfile()).joints, "imperial");
    const shelves = rows.find((r) => r.text.startsWith("Shelf in dados in "));
    expect(shelves).toMatchObject({
      detail: '23/32" wide, 1/4" deep',
      missing: false,
      shop: "Your dado stack cuts this.",
    });
  });

  it("says what you would need when the shop has no tool for it", () => {
    const rows = joineryRows(solve(bookcase, { kerf: 25_400, tools: [] }).joints, "imperial");
    expect(rows.every((r) => r.missing)).toBe(true);
    expect(rows[0]?.shop).toBe(
      "You'd need a dado stack, or a router with a straight bit no wider than 23/32\".",
    );
  });

  it("describes the box's corners as dovetails cut by hand", () => {
    const box = startProject("Keepsake box", "imperial").project;
    const rows = joineryRows(solve(box, loadShopProfile()).joints, "imperial");
    expect(rows.some((r) => r.text.includes("dovetails") && r.shop === "Cut by hand.")).toBe(true);
  });

  it("gives each cut of one joint its own key", () => {
    const cut = {
      kind: "dado",
      depth: 50_800,
      tool: "dadoStack",
      missing: false,
      count: 1,
    } as const;
    const joint: JointSummary = {
      joint: "j1",
      type: "dado",
      host: "Right side",
      guest: "Shelf",
      pairs: 1,
      cuts: [
        { ...cut, width: 100_000 },
        { ...cut, width: 120_000 },
      ],
    };
    const keys = joineryRows([joint], "imperial").map((r) => r.key);
    expect(new Set(keys).size).toBe(2);
  });
});
