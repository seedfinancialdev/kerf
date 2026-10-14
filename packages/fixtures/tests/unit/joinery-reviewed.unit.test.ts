// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, D2: "Accept all" sets joineryReviewed on the form; saved, undoable, changes no board.

import { type Project, parseProject, serializeProject, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();

function withFlag(name: "bookcase" | "box", value: unknown): Project {
  const project = structuredClone(loadProject(name, "structure"));
  const s = project.structures[0];
  if (!s) throw new Error("no structure");
  (s.options as Record<string, unknown>).joineryReviewed = value;
  return project;
}

describe("joineryReviewed", () => {
  it("is a setting a case has: no unknown-option warning", () => {
    const rules = solve(withFlag("bookcase", true), shop).diagnostics.map((d) => d.rule);
    expect(rules).not.toContain("unknown-option");
  });

  it("is a setting a box has", () => {
    const rules = solve(withFlag("box", true), shop).diagnostics.map((d) => d.rule);
    expect(rules).not.toContain("unknown-option");
  });

  it("must be true or false", () => {
    const d = solve(withFlag("bookcase", "yes"), shop).diagnostics.find(
      (x) => x.rule === "invalid-option",
    );
    expect(d).toMatchObject({ severity: "error", field: "joineryReviewed" });
  });

  it("changes no board: the cut list is the same either way", () => {
    expect(solve(withFlag("bookcase", true), shop).cutList).toEqual(
      solve(withFlag("bookcase", false), shop).cutList,
    );
  });

  it("is saved and read back", () => {
    const text = serializeProject(withFlag("bookcase", true));
    expect(parseProject(text).structures[0]?.options.joineryReviewed).toBe(true);
  });
});
