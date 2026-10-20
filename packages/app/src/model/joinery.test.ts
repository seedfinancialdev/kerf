// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "4. Joinery from your shop": "Shelves get dados if you own a dado stack or a
// straight bit; otherwise the app shows what you'd need." Example wording, "Machining by setup":
// "Dado stack 23/32", 1/4" deep".

import { INCH, type JointSummary, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { joineryRows } from "./joinery";
import { type ShopRecord, STARTER_RECORD, shopProfileFor } from "./shop-record";

const bookcase = startProject("Bookcase", "imperial").project;

/** A set-up shop with no dado stack and no router: nothing in it cuts a dado. */
const NO_DADO_TOOLS: ShopRecord = { ...STARTER_RECORD, setUp: true, dadoStack: null, router: null };

describe("joineryRows()", () => {
  it("describes the shelves' dados and says the dado stack cuts them", () => {
    const rows = joineryRows(solve(bookcase, loadShopProfile()).joints, "imperial", STARTER_RECORD);
    const shelves = rows.find((r) => r.text.startsWith("Shelf in dados in "));
    expect(shelves).toMatchObject({
      detail: '23/32" wide, 1/4" deep',
      missing: false,
      shop: "Your dado stack cuts this.",
      topic: "dadoStack",
    });
  });

  it("says what you would need when the shop has no tool for it", () => {
    const rows = joineryRows(
      solve(bookcase, shopProfileFor(NO_DADO_TOOLS)).joints,
      "imperial",
      NO_DADO_TOOLS,
    );
    expect(rows.every((r) => r.missing)).toBe(true);
    expect(rows[0]?.shop).toBe(
      "You'd need a dado stack, or a router with a straight bit no wider than 23/32\".",
    );
    // The engine names the dado stack for a cut nothing in the shop makes (core
    // outputs/machining.ts).
    expect(rows[0]?.topic).toBe("dadoStack");
  });

  it("says how wide the dado stack cuts when the dado is wider, and what would cut it", () => {
    // Task 11 review: a 1/2" stack (101,600) meets the bookcase's 23/32" shelf dados.
    const narrow: ShopRecord = { ...NO_DADO_TOOLS, dadoStack: { maxWidth: INCH / 2 } };
    const rows = joineryRows(solve(bookcase, shopProfileFor(narrow)).joints, "imperial", narrow);
    const shelves = rows.find((r) => r.text.startsWith("Shelf in dados in "));
    expect(shelves?.missing).toBe(true);
    expect(shelves?.shop).toBe(
      'Your dado stack cuts up to 1/2" wide. This joint is 23/32" wide; it needs a router with a straight bit no wider than 23/32".',
    );
  });

  it("describes the box's corners as dovetails cut by hand", () => {
    const box = startProject("Keepsake box", "imperial").project;
    const rows = joineryRows(solve(box, loadShopProfile()).joints, "imperial", STARTER_RECORD);
    const corners = rows.filter((r) => r.text.includes("dovetails"));
    expect(corners.map((r) => [r.shop, r.topic])).toContainEqual(["Cut by hand.", "handTools"]);
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
    const keys = joineryRows([joint], "imperial", STARTER_RECORD).map((r) => r.key);
    expect(new Set(keys).size).toBe(2);
  });
});
