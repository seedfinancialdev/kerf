// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015 rule 9: every joint in shop words, with the tool each cut needs.

import { type JointSummary, type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const IN = 203200;

/** Total cuts by kind, width and depth across every joint. */
function cutsBySetting(joints: JointSummary[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of joints) {
    for (const c of j.cuts) {
      const key = `${c.kind} ${c.width}x${c.depth}`;
      out[key] = (out[key] ?? 0) + c.count;
    }
  }
  return out;
}

describe("solve().joints", () => {
  const form = loadProject("bookcase", "structure");

  it("lists 8 shelf dados, 4 end rabbets and 2 back rabbets for the bookcase", () => {
    // Operation specs, bookcase: each side has 4 dados 23/32 × 1/4 (×2 sides = 8), 2 end rabbets
    // 23/32 × 1/4 (×2 = 4), and a back rabbet 1/4 wide × 3/8 deep (×2 = 2).
    expect(cutsBySetting(solve(form, shop).joints)).toEqual({
      [`dado ${(23 * IN) / 32}x${IN / 4}`]: 8,
      [`rabbet ${(23 * IN) / 32}x${IN / 4}`]: 4,
      [`rabbet ${IN / 4}x${(3 * IN) / 8}`]: 2,
    });
  });

  it("cuts every bookcase joint on the shop's dado stack", () => {
    // Shop profile: dado stack up to 3/4" (152400), wider than 23/32" and 1/4".
    const tools = solve(form, shop).joints.flatMap((j) => j.cuts.map((c) => [c.tool, c.missing]));
    expect(new Set(tools.map((t) => t.join()))).toEqual(new Set(["dadoStack,false"]));
  });

  it("marks every cut missing in a shop with no dado stack and no straight bit", () => {
    const bare: ShopProfile = { kerf: 25_400, tools: [{ type: "handTools", dovetails: true }] };
    const missing = solve(form, bare).joints.flatMap((j) => j.cuts.map((c) => c.missing));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every(Boolean)).toBe(true);
  });

  it("names the boards each joint joins and the form that made it", () => {
    const dado = solve(form, shop).joints.find((j) => j.type === "dado");
    expect(dado?.guest).toBe("Shelf");
    expect(dado?.host).toMatch(/^(Left|Right) side$/);
    expect(dado?.source?.role).toBeTypeOf("string");
  });

  it("names a board with no name of its own by its part, never by its id (branch deferred row 19)", () => {
    const hand = loadProject("bookcase");
    const host = hand.joints[0]?.host;
    const unnamed: Project = {
      ...hand,
      instances: hand.instances.map((i) => (i.id === host ? { ...i, name: undefined } : i)),
    };
    const def = hand.instances.find((i) => i.id === host)?.def;
    const partName = hand.parts.find((d) => d.id === def)?.name;
    const summary = solve(unnamed, shop).joints.find((j) => j.joint === hand.joints[0]?.id);
    expect(partName).toBeTypeOf("string");
    expect(summary?.host).toBe(partName);
  });

  it("names a row by its part, and a single board by its own name", () => {
    // R3: the Joinery list reads "Shelf in dados in Right side", never "Shelf 1 in dados ...".
    const expanded = loadProject("bookcase", "project");
    const named: Project = {
      ...expanded,
      instances: expanded.instances.map((i) =>
        i.name === "Shelf" ? { ...i, name: "Shelf 1" } : i,
      ),
    };
    const joints = solve(named, shop).joints;
    expect(joints.find((j) => j.type === "dado")?.guest).toBe("Shelf");
    expect(joints.find((j) => j.type === "dado")?.host).toBe("Right side");
  });

  it("cuts the box's dovetails with hand tools", () => {
    const box = loadProject("box", "structure");
    const tails = solve(box, shop).joints.filter((j) => j.type === "throughDovetail");
    // Keepsake box: four through-dovetail corners.
    expect(tails.reduce((n, j) => n + j.pairs, 0)).toBe(4);
    expect(tails.every((j) => j.cuts.every((c) => c.tool === "handTools" && !c.missing))).toBe(
      true,
    );
  });
});
