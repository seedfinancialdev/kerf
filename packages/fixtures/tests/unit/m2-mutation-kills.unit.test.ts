// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Boundary-value and exact-value tests from the second M2 review (the mutation pass): each was
// written against a specific changed line that no earlier test noticed. Expected values are
// worked out by hand from the spec, never read back from the code.

import {
  condense,
  type Diagnostic,
  deriveJoints,
  INCH,
  MAX_LENGTH,
  nestSheets,
  type Project,
  type RemovalPrimitive,
  type ShopProfile,
  shopProblem,
  solve,
  solveModel,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const q = (n: number): number => (n * INCH) / 64;
const inch = (n: number): number => n * INCH;
const rules = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const hostCuts = (p: Project, name = "Host"): RemovalPrimitive[] => {
  const m = solveModel(p);
  const d = deriveJoints(p, m);
  const id = m.instances.find((i) => i.name === name)?.id ?? "";
  return d.instances.get(id)?.cuts ?? [];
};

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
const wood = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "1/2in",
  stock: "wood",
});
const at = (name: string, y: string, partName = name): InstanceSpec => ({
  name,
  part: partName,
  at: ["0in", y, "0in"],
});

describe("joints", () => {
  it("[R5] a zero rabbet width is invalid-parameter, not 'not seated'", () => {
    const r = rules(rabbetP({ width: "0in" }));
    expect(r).toContain("error:invalid-parameter");
    expect(r).not.toContain("error:rabbet-not-seated");
  });
  it("[R11] a zero rabbet depth is invalid-parameter", () => {
    expect(rules(rabbetP({ depth: "0in" }))).toContain("error:invalid-parameter");
  });
  it("[R7] an edge1 rabbet is cut from y = W - width (5-1/2in to 6in), 3/8in deep on the top", () => {
    const cuts = hostCuts(rabbetP({}, ["2in", "5.5in", "3/4in"]));
    expect(cuts).toEqual([
      { kind: "box", min: [0, inch(5.5), inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
  });
  // Guests whose thickness runs along the host's length (orientation 17) meet the ends.
  const standing = (params: Record<string, string>, x: string): Project =>
    rabbetP(params, [x, "0in", "3/4in"], guest, 17);

  it("an end0 rabbet: the guest against the end, or against the shoulder of a wider step", () => {
    expect(rules(standing({}, "0in"))).toEqual([]);
    expect(hostCuts(standing({}, "0in"))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(1 / 2), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "1/4in"))).toEqual([]);
    expect(hostCuts(standing({ width: "3/4in" }, "1/4in"))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(3 / 4), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "0in"))).toContain("error:rabbet-not-seated");
  });

  it("an end1 rabbet: the guest against the end, or against the shoulder of a wider step", () => {
    expect(rules(standing({}, "11.5in"))).toEqual([]);
    expect(rules(standing({ width: "3/4in" }, "11.25in"))).toEqual([]);
    expect(hostCuts(standing({ width: "3/4in" }, "11.25in"))).toEqual([
      { kind: "box", min: [inch(11.25), 0, inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "11.5in"))).toContain("error:rabbet-not-seated");
  });

  it("an edge1 rabbet wider than the guest is cut from the shoulder the guest stands against", () => {
    expect(rules(rabbetP({ width: "3/4in" }, ["2in", "5.25in", "3/4in"]))).toEqual([]);
    expect(hostCuts(rabbetP({ width: "3/4in" }, ["2in", "5.25in", "3/4in"]))).toEqual([
      { kind: "box", min: [0, inch(5.25), inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
  });

  it("a guest hanging off the edge of the host is not seated in the rabbet", () => {
    // 5" along y from y = -4" to 1": only the last 1" is over the host, but the guest is not in the step.
    const p = rabbetP({ width: "1in" }, ["2in", "-4in", "3/4in"], guest, 17);
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });

  it("a rabbet narrower than the guest says so", () => {
    const found = solve(rabbetP({ width: "1/4in" }), shop).diagnostics.find(
      (d) => d.rule === "rabbet-not-seated",
    );
    expect(found?.message).toMatch(/narrower/);
  });

  it("a rabbet exactly half the host's width, with the guest against its shoulder, is built", () => {
    expect(rules(rabbetP({ width: "3in" }, ["2in", "2.5in", "3/4in"]))).toEqual([]);
    expect(hostCuts(rabbetP({ width: "3in" }, ["2in", "2.5in", "3/4in"]))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(12), inch(3), inch(3 / 4)] },
    ]);
  });

  it("[R13] a board standing mid-board across the full width is not seated in a rabbet", () => {
    const wide: PartSpec = { ...guest, width: "6in" };
    const p = boards(
      [host, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 17 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });
  it("[R9] a guest lying flat is not seated even when its length equals its thickness", () => {
    const stub: PartSpec = { ...guest, length: "1/2in" };
    const p = boards(
      [host, stub],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "0in", "3/4in"], orientation: 0 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });
  it("[D4] a dado ending exactly at the board's end is allowed: x 11-1/2in to 12in", () => {
    const p = dadoP({}, ["11.5in", "1/2in", "3/4in"]);
    expect(rules(p)).toEqual([]);
    expect(hostCuts(p)).toEqual([
      { kind: "box", min: [inch(11.5), 0, inch(0.5)], max: [inch(12), inch(6), inch(0.75)] },
    ]);
  });
  it("[S1] the error for a guest against the end of a board names end1", () => {
    const p = dadoP({}, ["12in", "1/2in", "0in"]); // orientation 17 guest touching x = 12
    const d = solve(p, shop).diagnostics.find((x) => x.rule === "dado-needs-face");
    expect(d?.message).toContain("end1");
  });
  it("[S6] the error for a guest against the edge of a board names edge1", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "6in", "0in"], orientation: 0 }],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
    const d = solve(p, shop).diagnostics.find((x) => x.rule === "dado-needs-face");
    expect(d?.message).toContain("edge1");
  });
  it("[D5] a stop as long as the whole dado is an error", () => {
    expect(rules(dadoP({ stop: "6in" }, ["2in", "1/2in", "3/4in"]))).toContain("error:dado-stop");
  });
  it("[D10] a stop of zero is an error", () => {
    expect(rules(dadoP({ stop: "0in" }, ["2in", "1/2in", "3/4in"]))).toContain("error:dado-stop");
  });
  it("[V4] dados of half the thickness on opposite faces, one above the other, do not overlap", () => {
    const h: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "4in"] };
    const p = boards(
      [host, guest, { ...guest, name: "Guest2" }],
      [
        h,
        { name: "Guest", part: "Guest", at: ["2in", "1/2in", "4.75in"], orientation: 17 },
        { name: "G2", part: "Guest2", at: ["2in", "1/2in", "0in"], orientation: 17 },
      ],
      [
        { type: "dado", host: "Host", guest: "Guest", params: { depth: "3/8in" } },
        { type: "dado", host: "Host", guest: "G2", params: { depth: "3/8in" } },
      ],
    );
    expect(rules(p)).toEqual([]);
  });
  it("[V5] one overlapping pair of dados has no count", () => {
    const p = boards(
      [host, guest, { ...guest, name: "Guest2" }],
      [
        hostAt,
        { name: "Guest", part: "Guest", at: ["2in", "1/2in", "3/4in"], orientation: 17 },
        { name: "G2", part: "Guest2", at: ["2.25in", "1/2in", "3/4in"], orientation: 17 },
      ],
      [
        { type: "dado", host: "Host", guest: "Guest" },
        { type: "dado", host: "Host", guest: "G2" },
      ],
    );
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "dado-overlap");
    expect(d).toHaveLength(1);
    expect(d[0]?.count).toBeUndefined();
  });
  it("[V3] one guest touching nothing is reported once, without a count", () => {
    const p = dadoP({}, ["2in", "1/2in", "30in"]);
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "joint-no-contact");
    expect(d).toHaveLength(1);
    expect(d[0]?.count).toBeUndefined();
  });
  it("[V1,S4,S7] guests of a pattern that overlap the host are reported as one aggregate, not per pair", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "1/2in", "0in"], orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest" }],
      {
        patterns: [
          { source: "Guest", count: "3", axis: "x", spacing: { mode: "fixed", step: "3in" } },
        ],
      },
    );
    const r = rules(p);
    expect(r).not.toContain("error:joint-overlap");
  });
  it("[V6] a conflicting roundover on a part used twice is reported once", () => {
    const part: PartSpec = {
      ...host,
      name: "Top",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
        {
          id: "01K7M3Q8ZD00000000F3000A02",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/4in",
        },
      ],
    };
    const p = boards(
      [part],
      [
        { name: "A", part: "Top", at: ["0in", "0in", "0in"] },
        { name: "B", part: "Top", at: ["0in", "10in", "0in"] },
      ],
    );
    expect(solve(p, shop).diagnostics.filter((d) => d.rule === "roundover-conflict")).toHaveLength(
      1,
    );
  });
  it("[O7] two radii on one edge are a roundover-conflict; [O10] and no cut is derived", () => {
    const part: PartSpec = {
      ...host,
      name: "Top",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
        {
          id: "01K7M3Q8ZD00000000F3000A02",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/4in",
        },
      ],
    };
    const p = boards([part], [{ name: "Top", part: "Top", at: ["0in", "0in", "0in"] }]);
    expect(rules(p)).toContain("error:roundover-conflict");
    expect(hostCuts(p, "Top")).toEqual([]);
  });
  const topWith = (edges: string[], radius: string, w = "20in"): Project => {
    const part: PartSpec = {
      name: "Top",
      length: "30in",
      width: w,
      thickness: "3/4in",
      ops: [{ id: "01K7M3Q8ZD00000000F3000A01", type: "roundover", edges: edges as never, radius }],
    };
    return boards([part], [{ name: "Top", part: "Top", at: ["0in", "0in", "0in"] }]);
  };
  it("[O6] radii on opposite edges of opposite faces do not compete", () => {
    expect(rules(topWith(["edge0/face0", "edge1/face1"], "1/2in"))).toEqual([]);
  });
  it("[O9] the two ends of one face compete like the two edges", () => {
    expect(rules(topWith(["end0/face1", "end1/face1"], "1/2in"))).toContain(
      "error:roundover-radii-too-large",
    );
  });
  it("[O2] a radius equal to the width of a narrow strip is allowed", () => {
    expect(rules(topWith(["edge0/face1"], "1/2in", "1/2in"))).toEqual([]);
  });
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
  it("[M7] hand tools without dovetails leave the dovetail setup missing", () => {
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
  it("[M10] a dovetail setup has no width or depth", () => {
    const hand = solve(loadProject("box"), shop).setups.find((x) => x.tool === "handTools");
    expect(hand).toBeDefined();
    expect(hand).not.toHaveProperty("width");
    expect(hand).not.toHaveProperty("depth");
  });
  it("[M9,M14] setups follow part order in the project, not the order joints are listed", () => {
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

  it("[C1] parts of one cut size whose visible WIDTHS differ are flagged visibleVaries", () => {
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
  it("[C3] a merged line sits where its first part sits in the project", () => {
    const p = boards(
      [ply("A", "10in", "4in"), ply("B", "20in", "4in"), ply("C", "10in", "4in")],
      [at("A", "0in"), at("B", "5in"), at("C", "10in")],
    );
    const lines = solve(p, shop).cutList.lines;
    expect(lines.map((l) => l.parts.map((x) => x.name))).toEqual([["A", "C"], ["B"]]);
  });
  it("[C6] parts inside a line are listed in project order, not instance order", () => {
    const p = boards(
      [ply("A", "10in", "4in"), ply("C", "10in", "4in")],
      [at("C", "0in"), at("A", "5in")],
    );
    expect(solve(p, shop).cutList.lines[0]?.parts.map((x) => x.name)).toEqual(["A", "C"]);
  });
  it("[V10] a joint whose host failed to evaluate adds no 'touches nothing' error", () => {
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
  it("[V13] a board with dovetails at both ends grows by proud at each: 10in + 2 x 1/16in", () => {
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
  it("[T4] an over-long joint expression is limit-exceeded", () => {
    const p = rabbetP({ depth: `0in${"+0in".repeat(5000)}` });
    expect(rules(p)).toContain("error:limit-exceeded");
  });
  it("[T1] seven identical failures: five are shown (merged, count 5)", () => {
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

describe("validate", () => {
  const tall = withParam(loadProject("box"), "box_height", "4in + 1/64in");
  const withBottomZ = (z: string): Project => ({
    ...tall,
    instances: tall.instances.map((i) =>
      i.name === "Bottom" ? { ...i, position: { ...i.position, z } } : i,
    ),
  });
  const warned = (z: string): string[] =>
    solve(withBottomZ(z), shop)
      .diagnostics.filter((d) => d.rule === "groove-outside-bottom-half-pin")
      .map((d) => (d.field ?? "").replace(" groove", ""))
      .sort();
  // Hand calculation (Operation specs, keepsake box): W = 4-1/64", 3 tails of 1/4" pins -> the bottom
  // half-pin is 16/64 + 1/64 = 17/64". The groove is 1/4" wide, 1/4" deep in 1/2" stock and the
  // tails' slope offset is 1/16" (1:8 over 1/2"). Allowed far edge of the groove from the bottom
  // edge: 17/64 + (1/16 x shallowest depth 1/4") / (1/2") = 17/64 + 2/64 = 19/64". The groove's far
  // edge is z + 1/4" = z + 16/64, so a groove with its bottom at z <= 3/64 is inside, 4/64 is not.
  it("[Va7,Va11] a groove exactly on the limit (z = 3/64) does not warn for Front and Back", () => {
    expect(warned("3/64in")).toEqual(["Side A", "Side B"]);
  });
  it("[Va10] one grid step higher (z = 4/64) Front and Back warn too", () => {
    expect(warned("4/64in")).toEqual(["Back", "Front", "Side A", "Side B"]);
  });
  it("[Va9] a groove at the very bottom warns nobody", () => {
    expect(warned("0in")).toEqual([]);
  });
  it("[Va12] each board is warned once, with no count", () => {
    const d = solve(withBottomZ("4/64in"), shop).diagnostics.filter(
      (x) => x.rule === "groove-outside-bottom-half-pin",
    );
    expect(d).toHaveLength(4);
    for (const x of d) expect(x.count).toBeUndefined();
  });
  it("[Va1,Va3] exactly 10 overlapping pairs name all ten; 15 pairs name ten and count fifteen", () => {
    const blocks = (n: number): Project =>
      boards(
        [ply("P", "4in", "4in")],
        Array.from({ length: n }, (_, i) => ({
          name: `P${i}`,
          part: "P",
          at: ["0in", "0in", "0in"] as [string, string, string],
        })),
      );
    const five = solve(blocks(5), shop).diagnostics.filter((d) => d.rule === "overlap");
    expect(five).toHaveLength(10);
    expect(five.every((d) => d.count === undefined)).toBe(true);
    const six = solve(blocks(6), shop).diagnostics.filter((d) => d.rule === "overlap");
    expect(six).toHaveLength(11);
    expect(six.filter((d) => d.count !== undefined).map((d) => d.count)).toEqual([15]);
  });
  it("[Va4] a roundover on the TOP edge that a joint covers is reported hidden", () => {
    const top: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
      ],
    };
    const wide: PartSpec = { ...guest, width: "12in" };
    const p = boards(
      [top, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "0in", "3/4in"], orientation: 16 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("warning:roundover-hidden");
  });
  it("[Va16,Va18] roundovers on end1 and edge1 are found hidden where a joint covers them", () => {
    const end: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["end1/face1"],
          radius: "1/8in",
        },
      ],
    };
    const wide: PartSpec = { ...guest, width: "6in" };
    const p = boards(
      [end, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["11.5in", "0in", "3/4in"], orientation: 17 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("warning:roundover-hidden");
    const edge1: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge1/face1"],
          radius: "1/8in",
        },
      ],
    };
    const long: PartSpec = { ...guest, width: "12in" };
    const p2 = boards(
      [edge1, long],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "5.5in", "3/4in"], orientation: 16 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p2)).toContain("warning:roundover-hidden");
  });
  it("[Va5] a roundover on a dovetailed board does not crash the solve", () => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/16in",
        },
      ],
    };
    const tails: PartSpec = {
      name: "Tails",
      length: "6in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const p = boards(
      [pins, tails],
      [
        { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
        { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
      ],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
    );
    expect(rules(p)).not.toContain("error:internal-error");
  });
});

describe("condense", () => {
  const d = (over: Partial<Diagnostic>): Diagnostic => ({
    severity: "error",
    rule: "r",
    message: "m",
    ...over,
  });
  it("[Dg1,Dg7,Dg3,Dg10] shows 25 per rule, then one summary counting the rest by their own counts", () => {
    const list = Array.from({ length: 25 }, (_, i) => d({ field: `f${i}` }));
    list.push(d({ field: "x1", count: 3 }), d({ field: "x2", count: 3 }));
    const out = condense(list);
    expect(out).toHaveLength(26);
    expect(out[25]).toMatchObject({ severity: "error", rule: "r", count: 6 });
    expect(out[25]?.message).toContain("6 more");
  });
  it("[Dg1] 26 entries leave exactly one in the summary", () => {
    const out = condense(Array.from({ length: 26 }, (_, i) => d({ field: `f${i}` })));
    expect(out).toHaveLength(26);
    expect(out[25]?.count).toBe(1);
  });
  it("[Dg4] repeats merge by adding their counts", () => {
    const out = condense([d({}), d({}), d({ count: 3 })]);
    expect(out).toEqual([d({ count: 5 })]);
  });
  it("[Dg2] same rule and field but a different message stay separate", () => {
    expect(condense([d({ message: "a" }), d({ message: "b" })])).toHaveLength(2);
  });
  it("[Dg6] an error and a warning of one rule stay separate", () => {
    expect(condense([d({}), d({ severity: "warning" })])).toHaveLength(2);
  });
  it("[Dg8] the same message on different parts stays separate", () => {
    expect(condense([d({ part: "p1" }), d({ part: "p2" })])).toHaveLength(2);
  });
  it("[Dg9] the same message from different joints stays separate", () => {
    expect(condense([d({ joint: "j1" }), d({ joint: "j2" })])).toHaveLength(2);
  });
  it("[Dg5] warnings do not use up the errors' quota of one rule", () => {
    const list = [
      ...Array.from({ length: 25 }, (_, i) => d({ field: `e${i}` })),
      ...Array.from({ length: 25 }, (_, i) => d({ severity: "warning", field: `w${i}` })),
    ];
    expect(condense(list)).toHaveLength(50);
  });
});

describe("shop profile", () => {
  const ok = { kerf: 635000 / 5, tools: [] };
  it("[Sh1] a dado stack of zero width is invalid", () => {
    expect(shopProblem({ ...ok, tools: [{ type: "dadoStack", maxWidth: 0 }] })).not.toBeNull();
  });
  it("[Sh2] a kerf of exactly MAX_LENGTH is valid, one more is not", () => {
    expect(shopProblem({ ...ok, kerf: MAX_LENGTH })).toBeNull();
    expect(shopProblem({ ...ok, kerf: MAX_LENGTH + 1 })).not.toBeNull();
  });
  it("[Sh4] hand tools need a boolean dovetails setting", () => {
    expect(shopProblem({ ...ok, tools: [{ type: "handTools" }] })).not.toBeNull();
    expect(shopProblem({ ...ok, tools: [{ type: "handTools", dovetails: "yes" }] })).not.toBeNull();
  });
  it("[Sh6,Sh10] a router needs both lists of bits", () => {
    expect(shopProblem({ ...ok, tools: [{ type: "router", straightBits: [100] }] })).not.toBeNull();
    expect(
      shopProblem({ ...ok, tools: [{ type: "router", roundoverBits: [100] }] }),
    ).not.toBeNull();
    expect(
      shopProblem({ ...ok, tools: [{ type: "router", straightBits: 5, roundoverBits: [1] }] }),
    ).not.toBeNull();
  });
  it("[Sh7] null is a diagnostic, not a throw", () => {
    expect(shopProblem(null)).not.toBeNull();
  });
  it("[Sh8] a null tool is a diagnostic, not a throw", () => {
    expect(shopProblem({ ...ok, tools: [null] })).not.toBeNull();
  });
});

describe("pipeline", () => {
  it("[Pl3] a blocked solve returns no shapes", () => {
    const p = dadoP({ depth: "3/4in" }, ["2in", "1/2in", "3/4in"]);
    const r = solve(p, shop);
    expect(r.blocked).toBe(true);
    expect(r.shapes).toEqual([]);
  });
  it("[Pl5] an invalid shop profile and a part too large both set blocked", () => {
    const huge = boards([ply("Huge", "100in", "10in")], [at("Huge", "0in")]);
    expect(solve(huge, shop).blocked).toBe(true);
    expect(solve(loadProject("bookcase"), { kerf: -1, tools: [] } as ShopProfile).blocked).toBe(
      true,
    );
  });
  it("[Pl8] an overlap between unjoined parts withholds the cut list and shapes", () => {
    const p = boards([ply("P", "4in", "4in")], [at("P1", "0in", "P"), at("P2", "0in", "P")]);
    const r = solve(p, shop);
    expect(r.diagnostics.map((x) => x.rule)).toContain("overlap");
    expect(r.cutList).toEqual({ lines: [], blocks: [] });
    expect(r.shapes).toEqual([]);
  });
  it("[Pl12] a project with no sheet goods still gets its dovetail setup", () => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const tails: PartSpec = {
      name: "Tails",
      length: "6in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const p = boards(
      [pins, tails],
      [
        { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
        { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
      ],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
    );
    const r = solve(p, shop);
    expect(r.nesting.sheets).toEqual([]);
    expect(r.setups.map((s) => s.tool)).toEqual(["handTools"]);
  });
  it("[Pl13] the shape of a dadoed host carries its removal: x 2in-2-1/2in, y 0-6in, z 1/2in-3/4in", () => {
    const r = solve(dadoP({}, ["2in", "1/2in", "3/4in"]), shop);
    const shape = r.shapes.find((s) => s.name === "Host");
    expect(shape?.removals).toEqual([
      { kind: "box", min: [inch(2), 0, inch(0.5)], max: [inch(2.5), inch(6), inch(0.75)] },
    ]);
  });
});

describe("nesting", () => {
  const kerf = INCH / 8;
  const opts = { kerf, trim: 0, minOffcut: 6 * INCH };
  const sheet = (l: number, w: number) => ({ stock: "s", length: l * INCH, width: w * INCH });
  const it_ = (name: string, l: number, w: number, locked = true) => ({
    instance: name,
    name,
    length: l * INCH,
    width: w * INCH,
    locked,
  });
  it("[N3] strips that exactly fill the sheet width fit on one sheet: 24 + 1/8 + 23-7/8 = 48", () => {
    const r = nestSheets([it_("a", 96, 24), it_("b", 96, 23.875)], sheet(96, 48), opts);
    expect(r.sheets).toHaveLength(1);
  });
  it("[N4] a strip exactly 6in wide leaves a usable offcut: x 7, length 17, width 6", () => {
    const r = nestSheets([it_("a", 7, 6)], sheet(24, 12), { ...opts, kerf: 0 });
    expect(r.sheets[0]?.offcuts).toContainEqual({
      x: inch(7),
      y: 0,
      length: inch(17),
      width: inch(6),
    });
  });
  it("[N23,N24,N30] edge trim moves offcuts and shrinks the usable width: 48 x 24 sheet, 1/2in trim", () => {
    const r = nestSheets([it_("a", 10, 10)], sheet(48, 24), {
      kerf: 0,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    expect(r.sheets[0]?.offcuts).toEqual([
      { x: inch(10.5), y: inch(0.5), length: inch(37), width: inch(10) },
      { x: inch(0.5), y: inch(10.5), length: inch(47), width: inch(13) },
    ]);
  });
  it("[N5] a sheet exactly 6in long still reports the 6 x 38 strip left across it", () => {
    const r = nestSheets([it_("a", 6, 10)], sheet(6, 48), { ...opts, kerf: 0 });
    expect(r.sheets[0]?.offcuts).toEqual([{ x: 0, y: inch(10), length: inch(6), width: inch(38) }]);
  });
  it("[N9] a square part is never reported as rotated", () => {
    const r = nestSheets([it_("long", 6, 19, false), it_("sq", 5, 5, false)], sheet(24, 48), {
      kerf,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    const rot = Object.fromEntries((r.sheets[0]?.placements ?? []).map((p) => [p.name, p.rotated]));
    expect(rot).toEqual({ long: true, sq: false });
  });
  it("[N11,N12] equal candidates: the earliest (natural orientation) wins", () => {
    const r = nestSheets([it_("sq", 11, 11, false)], sheet(24, 24), opts);
    expect(r.sheets[0]?.placements[0]?.rotated).toBe(false);
  });
  it("[N14] two offcuts of equal area: the first is the largest (8 x 26, not 13 x 16)", () => {
    const r = nestSheets([it_("a", 82, 16), it_("b", 87, 26, false)], sheet(96, 48), {
      kerf: 0,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    expect(r.sheets[0]?.largestOffcut).toEqual({
      alongGrain: inch(8),
      acrossGrain: inch(26),
      count: 1,
    });
  });
  it("[N15] only offcuts of the same length AND width are counted with the largest", () => {
    const r = nestSheets([it_("a", 40, 13), it_("b", 40, 8)], sheet(48, 24), {
      kerf: 0,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    expect(r.sheets[0]?.largestOffcut).toEqual({
      alongGrain: inch(7),
      acrossGrain: inch(13),
      count: 1,
    });
  });
  it("[N18] identical parts keep project order", () => {
    const r = nestSheets([it_("first", 16, 16), it_("second", 16, 16)], sheet(48, 24), {
      kerf: 0,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    expect(r.sheets[0]?.placements.map((p) => [p.name, p.x])).toEqual([
      ["first", inch(0.5)],
      ["second", inch(16.5)],
    ]);
  });
  it("[N26] an offcut whose strip is exactly 6in wide still counts when choosing a layout", () => {
    const r = nestSheets([it_("a", 88, 6), it_("b", 3, 11, false)], sheet(96, 12), {
      kerf: 0,
      trim: inch(0.5),
      minOffcut: 6 * INCH,
    });
    expect(r.sheets[0]?.offcuts).toEqual([
      { x: inch(88.5), y: inch(0.5), length: inch(7), width: inch(6) },
    ]);
  });
});

describe("solid stock and match sets", () => {
  const k = 0.125;
  const members = (l: string): PartSpec[] => [wood("A", l, "4in"), wood("B", l, "4in")];
  const inst = [at("A", "0in"), at("B", "5in"), at("Lid", "10in")];
  it("[B1,B4] seed 34in + a 37-7/8in lid fill a 72in board exactly: 33 + 1/8 + 37-7/8 = 71 = 72 - 1", () => {
    const p = boards([...members("16-7/16in"), wood("Lid", "37-7/8in", "4in")], inst, [], {
      matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
      woodLengths: [inch(48), inch(72), inch(96)],
    });
    const out = solve(p, shop).nesting.boards;
    expect(out.map((b) => b.boardLength)).toEqual([inch(72)]);
    expect(out[0]?.alsoOnBoard?.map((x) => x.name)).toEqual(["Lid"]);
  });
  it("[B5,B6] equal totals: the shortest-first packing wins, so the 36in set gets the 48in board", () => {
    const p = boards(
      [...members("17-7/16in"), wood("P", "48in", "4in"), wood("Q", "44in", "4in")],
      [at("A", "0in"), at("B", "5in"), at("P", "10in"), at("Q", "15in")],
      [],
      {
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
        woodLengths: [inch(48), inch(96)],
      },
    );
    const out = solve(p, shop).nesting.boards;
    expect(out.map((b) => b.boardLength)).toEqual([inch(48), inch(96)]);
    expect(out[0]?.matchSet).toBeDefined();
  });
  it("[B8,I7] a set whose composite is exactly a standard length (48in) is placed, not an error", () => {
    const p = boards(members("23-7/16in"), [at("A", "0in"), at("B", "5in")], [], {
      matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
      woodLengths: [inch(48)],
    });
    const r = solve(p, shop);
    expect(r.diagnostics.map((d) => d.rule)).not.toContain("match-set-too-long");
    expect(r.nesting.boards.map((b) => b.boardLength)).toEqual([inch(48)]);
  });
  it("[I5] a side-by-side set exactly as wide as the widest board is allowed", () => {
    const p = boards(
      [wood("A", "10in", "3-15/16in"), wood("B", "10in", "3-15/16in")],
      [at("A", "0in"), at("B", "5in")],
      [],
      {
        matchSets: [{ name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] }],
      },
    );
    expect(rules(p)).not.toContain("error:part-too-wide");
  });
  it("[I6] a part exactly as wide as the widest board is allowed", () => {
    expect(rules(boards([wood("W", "10in", "8in")], [at("W", "0in")]))).not.toContain(
      "error:part-too-wide",
    );
  });
  it("[I10] a set's composite length includes the stock's length allowance: 2 x (10 + 1) + 1/8 + 1 trim", () => {
    const p = boards(members("10in"), [at("A", "0in"), at("B", "5in")], [], {
      matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
      woodAllowanceLength: INCH,
    });
    expect(solve(p, shop).nesting.boards[0]?.composite?.length).toBe(inch(10 + 1 + 10 + 1 + k + 1));
  });
  it("[I15] a same-board set is laid end to end whatever axis is on it", () => {
    const p = boards(
      [wood("A", "10in", "3in"), wood("B", "10in", "3in")],
      [at("A", "0in"), at("B", "5in")],
      [],
      {
        matchSets: [{ name: "Same", type: "sameBoard", axis: "width", members: ["A", "B"] }],
      },
    );
    const r = solve(p, shop);
    expect(r.nesting.boards[0]?.composite).toEqual({
      length: inch(10 + 10 + k + 1),
      width: inch(3),
      widthAllowance: 0,
    });
  });
  it("[I3] 3 members along the grain on a sheet: 60 + 2 kerfs, not 3", () => {
    const p = boards(
      [ply("A", "20in", "10in"), ply("B", "20in", "10in"), ply("C", "20in", "10in")],
      [at("A", "0in"), at("B", "12in"), at("C", "24in")],
      [],
      {
        matchSets: [
          { name: "Run", type: "continuousGrain", axis: "length", members: ["A", "B", "C"] },
        ],
      },
    );
    const seq = solve(p, shop).nesting.sheets[0]?.cutSequence;
    expect(seq).toEqual([
      { op: "rip", sizes: [inch(10)] },
      { op: "crosscut", sizes: [inch(60.25)] }, // the blank: 3 x 20" + 2 kerfs of 1/8"
      { op: "crosscut", sizes: [inch(20), inch(20), inch(20)] }, // then divided
    ]);
  });
  it("[I16,I17,N8,N28] members side by side across the grain on a sheet", () => {
    const p = boards(
      [ply("A", "30in", "10in"), ply("B", "30in", "10in")],
      [at("A", "0in"), at("B", "12in")],
      [],
      {
        matchSets: [{ name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] }],
      },
    );
    const s = solve(p, shop).nesting.sheets[0];
    expect(s?.placements.map((x) => [x.name, x.x, x.y])).toEqual([
      ["A", 0, 0],
      ["B", 0, inch(10.125)],
    ]);
    expect(s?.cutSequence[0]).toEqual({ op: "rip", sizes: [inch(20.125)] });
  });
  it("[I9] a bookmatch set on sheet goods is nested as ordinary parts, so it may use two sheets", () => {
    const p = boards(
      [ply("A", "96in", "48in"), ply("B", "96in", "48in")],
      [at("A", "0in"), at("B", "60in")],
      [],
      {
        matchSets: [{ name: "Book", type: "bookmatch", members: ["A", "B"] }],
      },
    );
    const r = solve(p, shop);
    expect(r.diagnostics.map((d) => d.rule)).not.toContain("match-set-too-large");
    expect(r.nesting.sheets).toHaveLength(2);
  });
});

describe("solid-stock boards shared by match sets", () => {
  const set = (name: string, a: string, b: string) => ({
    name,
    type: "continuousGrain" as const,
    members: [a, b],
  });
  const wood = (name: string, length: string): PartSpec => ({
    name,
    length,
    width: "4in",
    thickness: "1/2in",
    stock: "wood",
  });
  const twoSets = (length: string): Project =>
    boards(
      [wood("A1", length), wood("A2", length), wood("B1", length), wood("B2", length)],
      [at("A1", "0in"), at("A2", "5in"), at("B1", "10in"), at("B2", "15in")],
      [],
      { matchSets: [set("One", "A1", "A2"), set("Two", "B1", "B2")] },
    );

  it("shares a board only when both composites and the kerf between them fit", () => {
    // Each set is 2 x L + 1/8" kerf; with 1/2" trim at each end a 96" board holds 95".
    // L = 23-5/8": 47-3/8" each, 47-3/8 + 1/8 + 47-3/8 = 94-7/8" -> one board.
    const shared = solve(twoSets("23-5/8in"), shop).nesting.boards;
    expect(shared).toHaveLength(2);
    expect(shared[0]?.boardIndex).toBeDefined();
    expect(shared[0]?.boardIndex).toBe(shared[1]?.boardIndex);
    // Both sets leave 95 - 94-7/8 = 1/8" on that board: a 1/16" part needs 1/16 + 1/8 kerf > 1/8",
    // so it is cut from a board of its own.
    const tiny = boards(
      [
        wood("A1", "23-5/8in"),
        wood("A2", "23-5/8in"),
        wood("B1", "23-5/8in"),
        wood("B2", "23-5/8in"),
        { ...wood("Tiny", "1/16in"), width: "1in" },
      ],
      [at("A1", "0in"), at("A2", "5in"), at("B1", "10in"), at("B2", "15in"), at("Tiny", "20in")],
      [],
      { matchSets: [set("One", "A1", "A2"), set("Two", "B1", "B2")] },
    );
    const crowded = solve(tiny, shop).nesting.boards;
    expect(crowded.some((b) => b.alsoOnBoard !== undefined)).toBe(false);
    // L = 23-11/16": 47-1/2" each, 47-1/2 + 1/8 + 47-1/2 = 95-1/8" -> two boards.
    const apart = solve(twoSets("23-11/16in"), shop).nesting.boards;
    expect(apart).toHaveLength(2);
    expect(apart[0]?.boardIndex).toBeUndefined();
  });
});

describe("result shapes", () => {
  it("are withheld when any error blocks the solve, including one found while nesting", () => {
    const big = boards([ply("Big", "100in", "10in")], [at("Big", "0in")]);
    const result = solve(big, shop);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.map((d) => d.rule)).toContain("part-too-large");
    expect(result.shapes).toEqual([]);
  });
});

describe("a pile of parts is reported, not ground through", () => {
  it("says so once when more than a million pairs touch", () => {
    const slab: PartSpec = { name: "Slab", length: "4in", width: "4in", thickness: "1/2in" };
    const p = boards([slab], [at("Slab", "0in")], [], {
      patterns: [
        { source: "Slab", count: "5000", axis: "x", spacing: { mode: "fixed", step: "1/64in" } },
      ],
    });
    const started = Date.now();
    const found = solve(p, shop).diagnostics.filter((d) => d.rule === "overlap");
    expect(Date.now() - started).toBeLessThan(15000);
    expect(found.map((d) => d.message).join(" ")).toMatch(/More than 1,000,000 pairs/);
  });
});
