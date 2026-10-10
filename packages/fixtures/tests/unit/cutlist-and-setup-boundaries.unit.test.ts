// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { INCH, type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;
const rules = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const hostAt: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "0in"] };
const rabbetP = (
  params: Record<string, string>,
  at: [string, string, string] = ["2in", "0in", "3/4in"],
  g: PartSpec = guest,
  orientation = 16,
): Project =>
  boards(
    [host, g],
    [hostAt, { name: "Guest", part: "Guest", at, orientation }],
    [{ type: "rabbet", host: "Host", guest: "Guest", params }],
  );
const dadoP = (params: Record<string, string>, at: [string, string, string]): Project =>
  boards(
    [host, guest],
    [hostAt, { name: "Guest", part: "Guest", at, orientation: 17 }],
    [{ type: "dado", host: "Host", guest: "Guest", params }],
  );
const ply = (name: string, l: string, w: string, extra: Partial<PartSpec> = {}): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
  ...extra,
});
const at = (name: string, y: string, partName = name): InstanceSpec => ({
  name,
  part: partName,
  at: ["0in", y, "0in"],
});

describe("outputs", () => {
  it("[M1] a dado exactly as wide as the stack's maximum uses the stack", () => {
    const p = dadoP({}, ["2in", "1/2in", "3/4in"]);
    const s = solve(p, {
      kerf: 1,
      tools: [{ type: "dadoStack", maxWidth: inch(0.5) }],
    } as ShopProfile).setups;
    expect(s[0]).toMatchObject({ tool: "dadoStack" });
    expect(s[0]?.missing).toBeUndefined();
  });
  it("[M2] a straight bit exactly as wide as the dado makes it on a router", () => {
    const p = dadoP({}, ["2in", "1/2in", "3/4in"]);
    const s = solve(p, {
      kerf: 1,
      tools: [{ type: "router", straightBits: [inch(0.5)], roundoverBits: [] }],
    } as ShopProfile).setups;
    expect(s[0]).toMatchObject({ tool: "router" });
    expect(s[0]?.missing).toBeUndefined();
  });
  it("hand tools without dovetails leave the dovetail setup missing", () => {
    const s = solve(loadProject("box"), {
      ...shop,
      tools: [
        { type: "handTools", dovetails: false },
        ...shop.tools.filter((t) => t.type !== "handTools"),
      ],
    } as ShopProfile).setups;
    const hand = s.find((x) => x.tool === "handTools");
    expect(hand?.missing).toBe(true);
  });
  it("a dovetail setup has no width or depth", () => {
    const hand = solve(loadProject("box"), shop).setups.find((x) => x.tool === "handTools");
    expect(hand).toBeDefined();
    expect(hand).not.toHaveProperty("width");
    expect(hand).not.toHaveProperty("depth");
  });
  it("setups follow part order in the project, not the order joints are listed", () => {
    const h1: PartSpec = { ...host, name: "H1" };
    const h2: PartSpec = { ...host, name: "H2" };
    const gA: PartSpec = { ...guest, name: "GA", thickness: "1/2in" };
    const gB: PartSpec = { ...guest, name: "GB", thickness: "1/4in" };
    const p = boards(
      [h1, h2, gA, gB],
      [
        { name: "H1", part: "H1", at: ["0in", "0in", "0in"] },
        { name: "H2", part: "H2", at: ["0in", "20in", "0in"] },
        { name: "GA", part: "GA", at: ["2in", "1/2in", "3/4in"], orientation: 17 },
        { name: "GB", part: "GB", at: ["2in", "20.5in", "3/4in"], orientation: 17 },
      ],
      [
        { type: "dado", host: "H2", guest: "GB" },
        { type: "dado", host: "H1", guest: "GA" },
      ],
    );
    const s = solve(p, shop).setups;
    expect(s.map((x) => x.width)).toEqual([inch(0.5), inch(0.25)]);
  });

  it("parts of one cut size whose visible WIDTHS differ are flagged visibleVaries", () => {
    // Guest stands on its edge (orientation 1): the groove adds 1/4in to its width: 5 -> 5-1/4.
    const j: PartSpec = { ...guest, name: "J", width: "5-1/4in" };
    const p = boards(
      [host, guest, j],
      [
        hostAt,
        { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 1 },
        { name: "J", part: "J", at: ["0in", "20in", "0in"] },
      ],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
    const line = solve(p, shop).cutList.lines.find((l) => l.parts.length === 2);
    expect(line?.width).toBe(inch(5.25));
    expect(line?.length).toBe(inch(4));
    expect(line?.visibleVaries).toBe(true);
  });
  it("a merged line sits where its first part sits in the project", () => {
    const p = boards(
      [ply("A", "10in", "4in"), ply("B", "20in", "4in"), ply("C", "10in", "4in")],
      [at("A", "0in"), at("B", "5in"), at("C", "10in")],
    );
    const lines = solve(p, shop).cutList.lines;
    expect(lines.map((l) => l.parts.map((x) => x.name))).toEqual([["A", "C"], ["B"]]);
  });
  it("parts inside a line are listed in project order, not instance order", () => {
    const p = boards(
      [ply("A", "10in", "4in"), ply("C", "10in", "4in")],
      [at("C", "0in"), at("A", "5in")],
    );
    expect(solve(p, shop).cutList.lines[0]?.parts.map((x) => x.name)).toEqual(["A", "C"]);
  });
  it("a joint whose host failed to evaluate adds no 'touches nothing' error", () => {
    const bad: PartSpec = { ...host, length: "1 +" };
    const p = boards(
      [bad, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "1/2in", "3/4in"], orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
    const r = rules(p);
    expect(r.length).toBeGreaterThan(0);
    expect(r).not.toContain("error:joint-no-contact");
  });
  it("a board with dovetails at both ends grows by proud at each: 10in + 2 x 1/16in", () => {
    const base = loadProject("box");
    const p: Project = {
      ...base,
      joints: base.joints.map((j) =>
        j.type === "throughDovetail" ? { ...j, params: { ...j.params, proud: "1/16in" } } : j,
      ),
    };
    const block = solve(p, shop).cutList.blocks[0];
    const front = block?.members.find((m) => m.name === "Front");
    expect(front?.length).toBe(inch(10) + 2 * (INCH / 16));
  });
  it("an over-long joint expression is limit-exceeded", () => {
    const p = rabbetP({ depth: `0in${"+0in".repeat(5000)}` });
    expect(rules(p)).toContain("error:limit-exceeded");
  });
  it("seven identical failures: five are shown (merged, count 5)", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "1/2in", "3/4in"], orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest", params: { depth: "3/4in" } }],
      {
        patterns: [
          { source: "Guest", count: "7", axis: "x", spacing: { mode: "fixed", step: "1.5in" } },
        ],
      },
    );
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "dado-too-deep");
    const total = d.reduce((s, x) => s + (x.count ?? 1), 0);
    expect(d.find((x) => !x.message.includes("more like it"))?.count).toBe(5); // [T1] five are shown
    expect(total).toBeGreaterThan(0);
  });
  it("[BUG-T2] counts of seven identical failures add up to 7 (baseline: 8)", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "1/2in", "3/4in"], orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest", params: { depth: "3/4in" } }],
      {
        patterns: [
          { source: "Guest", count: "7", axis: "x", spacing: { mode: "fixed", step: "1.5in" } },
        ],
      },
    );
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "dado-too-deep");
    expect(d.reduce((n, x) => n + (x.count ?? 1), 0)).toBe(7);
  });
});
