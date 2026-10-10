// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Cut list grouping, machining setups and project-level nesting on small hand-built projects.

import {
  buildCutList,
  INCH,
  machiningSetups,
  nest,
  type Project,
  type ShopProfile,
  solve,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec, WOOD_ID } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;

const panel = (name: string, l = "20in", w = "10in"): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
});
const at = (name: string, x: string, y: string, part = name): InstanceSpec => ({
  name,
  part,
  at: [x, y, "0in"],
});

describe("cut list grouping", () => {
  it("merges parts of the same stock and cut size, names them, and orders lines by part list", () => {
    const p = boards(
      [panel("Beta", "30in", "5in"), panel("Alpha"), panel("Gamma")],
      [
        at("Beta", "0in", "0in"),
        at("Alpha", "0in", "6in"),
        at("Gamma", "0in", "17in"),
        at("Alpha 2", "0in", "28in", "Alpha"),
      ],
    );
    const { lines } = buildCutList(p);
    expect(lines.map((l) => [l.length, l.width, l.quantity])).toEqual([
      [inch(30), inch(5), 1], // Beta is first in the part list
      [inch(20), inch(10), 3], // Alpha, Gamma and the second Alpha merge
    ]);
    expect(lines[1]?.parts).toEqual([
      { name: "Alpha", quantity: 2 },
      { name: "Gamma", quantity: 1 },
    ]);
  });

  it("keeps different stocks apart even at the same size", () => {
    const p = boards(
      [panel("Ply"), { ...panel("Wood"), stock: "wood" }],
      [at("Ply", "0in", "0in"), at("Wood", "0in", "20in")],
    );
    expect(buildCutList(p).lines).toHaveLength(2);
  });

  it("shows visible and cut size together and separates parts whose cut sizes differ", () => {
    const bookcase = loadProject("bookcase");
    const line = buildCutList(bookcase).lines[1];
    expect(line?.visible).toEqual({ length: 34.5625 * INCH, width: 11.75 * INCH });
    expect(line?.length).toBe(35.0625 * INCH);
  });

  it("lists match-set members as a block, in order, outside the lines", () => {
    const p = boards(
      [
        { ...panel("A", "10in", "4in"), stock: "wood" },
        { ...panel("B", "6in", "4in"), stock: "wood" },
      ],
      [at("A", "0in", "0in"), at("B", "0in", "5in")],
      [],
      {
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["B", "A"], axis: "length" }],
      },
    );
    const cut = buildCutList(p);
    expect(cut.lines).toEqual([]);
    expect(cut.blocks[0]?.members.map((m) => [m.sequence, m.of, m.name])).toEqual([
      [1, 2, "B"],
      [2, 2, "A"],
    ]);
  });
});

describe("machining setups", () => {
  const bookcase = loadProject("bookcase");
  const withTools = (tools: ShopProfile["tools"]): ShopProfile => ({ ...shop, tools });

  it("groups a dado and an end rabbet of the same width and depth into one setup", () => {
    const first = machiningSetups(bookcase, shop)[0];
    expect(first).toMatchObject({
      setup: 1,
      tool: "dadoStack",
      cuts: 12,
      width: 146050,
      depth: inch(0.25),
    });
  });

  it("falls back to a router with an undersized straight bit for a dado the stack cannot cut", () => {
    const tools = withTools([
      { type: "dadoStack", maxWidth: inch(0.5) },
      { type: "router", straightBits: [inch(0.25)], roundoverBits: [inch(0.125)] },
    ]);
    const setups = machiningSetups(bookcase, tools);
    expect(setups[0]).toMatchObject({ tool: "router", cuts: 12 });
    expect(setups[0]?.missing).toBeUndefined();
    expect(setups[1]).toMatchObject({ tool: "dadoStack", cuts: 2 }); // 1/4" back rabbet fits the stack
  });

  it("still lists a cut the shop cannot make, labelled with the tool it needs", () => {
    const setups = machiningSetups(bookcase, withTools([]));
    expect(setups.map((s) => [s.tool, s.cuts, s.missing])).toEqual([
      ["dadoStack", 12, true],
      ["dadoStack", 2, true],
      ["router", 8, true],
    ]);
  });

  it("flags a roundover bit the shop does not own and keeps edge profiles last", () => {
    const tools = withTools([
      { type: "dadoStack", maxWidth: inch(1) },
      { type: "router", straightBits: [], roundoverBits: [inch(0.25)] },
    ]);
    const setups = machiningSetups(bookcase, tools);
    expect(setups.at(-1)).toMatchObject({
      tool: "router",
      bit: { type: "roundover" },
      missing: true,
    });
  });

  it("puts hand-cut dovetails in a handTools setup and notes when the shop cannot cut them", () => {
    const box = loadProject("box");
    expect(machiningSetups(box, shop).find((s) => s.tool === "handTools")?.cuts).toBe(4);
    const noHands = machiningSetups(box, withTools([{ type: "dadoStack", maxWidth: inch(1) }]));
    expect(noHands.find((s) => s.tool === "handTools")?.missing).toBe(true);
  });

  it("orders sheet-goods setups before solid-stock ones, whatever the joint order", () => {
    const wood: PartSpec = {
      name: "WoodHost",
      length: "12in",
      width: "6in",
      thickness: "1/2in",
      stock: "wood",
    };
    const ply: PartSpec = { name: "PlyHost", length: "12in", width: "6in", thickness: "3/4in" };
    const g: PartSpec = {
      name: "G",
      length: "4in",
      width: "5in",
      thickness: "1/4in",
      stock: "wood",
    };
    const standing = (name: string, x: string, y: string, z: string): InstanceSpec => ({
      name,
      part: "G",
      at: [x, y, z],
      orientation: 16,
    });
    const p = boards(
      [wood, ply, g],
      [
        { name: "WoodHost", part: "WoodHost", at: ["0in", "0in", "0in"] },
        { name: "PlyHost", part: "PlyHost", at: ["0in", "20in", "0in"] },
        standing("G1", "2in", "2in", "1/2in"),
        standing("G2", "2in", "22in", "3/4in"),
      ],
      [
        { type: "dado", host: "WoodHost", guest: "G1" },
        { type: "dado", host: "PlyHost", guest: "G2" },
      ],
    );
    const setups = machiningSetups(p, shop);
    expect(setups).toHaveLength(2);
    expect(setups[0]?.depth).toBe((inch(0.75) / 3) | 0); // PlyHost: 3/4" / 3
    expect(setups[1]?.depth).toBeLessThan(setups[0]?.depth ?? 0); // WoodHost: 1/2" / 3 snapped down
  });
});

describe("nesting a project", () => {
  const stockOf = (p: Project) => solve(p, shop);

  it("nests the bookcase's solid-free project onto 3 sheets and counts them per stock", () => {
    const result = nest(loadProject("bookcase"), shop);
    expect(result.sheets).toHaveLength(3);
    expect(Object.values(result.sheetCountByStock).sort()).toEqual([1, 2]);
  });

  it("packs ordinary solid-stock parts onto boards and says which standard length", () => {
    const p = boards(
      [
        { ...panel("L", "40in", "4in"), stock: "wood" },
        { ...panel("M", "40in", "4in"), stock: "wood" },
        { ...panel("N", "40in", "4in"), stock: "wood" },
      ],
      [at("L", "0in", "0in"), at("M", "0in", "5in"), at("N", "0in", "10in")],
      [],
      { woodLengths: [96 * INCH, 48 * INCH] },
    );
    const { boards: layouts } = nest(p, shop);
    // 96" board takes two 40" parts (95" usable); the third goes on the shortest board that holds it.
    expect(layouts.map((b) => [b.boardLength, b.sequence.length])).toEqual([
      [96 * INCH, 2],
      [48 * INCH, 1],
    ]);
  });

  it("match-set-too-long: no standard board is long enough for the composite", () => {
    const p = boards(
      [
        { ...panel("A", "30in", "4in"), stock: "wood" },
        { ...panel("B", "30in", "4in"), stock: "wood" },
      ],
      [at("A", "0in", "0in"), at("B", "0in", "5in")],
      [],
      {
        woodLengths: [48 * INCH],
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
      },
    );
    const found = stockOf(p).diagnostics.find((d) => d.rule === "match-set-too-long");
    expect(found?.severity).toBe("error");
    expect(found?.message).toContain("Wrap");
    expect(found?.message).toContain("62"); // 30 + 1/8 + 30 + 1" trim = 61-1/8", needs at least 62"
  });

  it("part-too-large: a part bigger than the sheet is an error and the rest still nests", () => {
    const p = boards(
      [panel("Huge", "100in", "10in"), panel("Fine")],
      [at("Huge", "0in", "0in"), at("Fine", "0in", "20in")],
    );
    const result = stockOf(p);
    expect(result.diagnostics.map((d) => d.rule)).toContain("part-too-large");
    expect(result.nesting.sheets).toHaveLength(1);
  });

  it("part-too-wide and part-too-long on solid stock", () => {
    const p = boards(
      [
        { ...panel("Wide", "10in", "9in"), stock: "wood" },
        { ...panel("Long", "120in", "4in"), stock: "wood" },
      ],
      [at("Wide", "0in", "0in"), at("Long", "0in", "10in")],
    );
    const rules = stockOf(p).diagnostics.map((d) => d.rule);
    expect(rules).toContain("part-too-wide");
    expect(rules).toContain("part-too-long");
  });

  it("match-set-mixed-stock: members from different stock", () => {
    const p = boards(
      [panel("A"), { ...panel("B"), stock: "wood" }],
      [at("A", "0in", "0in"), at("B", "0in", "20in")],
      [],
      { matchSets: [{ name: "Mixed", type: "sameBoard", members: ["A", "B"] }] },
    );
    expect(stockOf(p).diagnostics.map((d) => d.rule)).toContain("match-set-mixed-stock");
  });

  it("a same-board set on sheet goods stays on one sheet; too big for one is an error", () => {
    const small = boards(
      [panel("A", "40in", "20in"), panel("B", "40in", "20in")],
      [at("A", "0in", "0in"), at("B", "0in", "25in")],
      [],
      { matchSets: [{ name: "Together", type: "sameBoard", members: ["A", "B"] }] },
    );
    expect(stockOf(small).nesting.sheets).toHaveLength(1);

    const big = boards(
      [panel("A", "90in", "40in"), panel("B", "90in", "40in")],
      [at("A", "0in", "0in"), at("B", "0in", "50in")],
      [],
      { matchSets: [{ name: "Together", type: "sameBoard", members: ["A", "B"] }] },
    );
    expect(stockOf(big).diagnostics.map((d) => d.rule)).toContain("match-set-too-large");
  });

  it("a bookmatch is flagged as not solved yet and nested as ordinary parts", () => {
    const p = boards(
      [
        { ...panel("A", "10in", "4in"), stock: "wood" },
        { ...panel("B", "10in", "4in"), stock: "wood" },
      ],
      [at("A", "0in", "0in"), at("B", "0in", "5in")],
      [],
      { matchSets: [{ name: "Doors", type: "bookmatch", members: ["A", "B"] }] },
    );
    const result = stockOf(p);
    expect(result.diagnostics.find((d) => d.rule === "not-solved-yet")?.severity).toBe("warning");
    expect(result.nesting.boards).toHaveLength(1);
    expect(result.nesting.boards[0]?.matchSet).toBeUndefined();
  });

  it("a continuous-grain set on sheet goods nests as one composite strip", () => {
    const p = boards(
      [panel("A", "30in", "10in"), panel("B", "30in", "10in")],
      [at("A", "0in", "0in"), at("B", "0in", "12in")],
      [],
      {
        matchSets: [{ name: "Run", type: "continuousGrain", members: ["A", "B"], axis: "length" }],
      },
    );
    const sheet = stockOf(p).nesting.sheets[0];
    expect(sheet?.placements).toHaveLength(1);
    expect(sheet?.placements[0]).toMatchObject({
      name: "Run",
      length: inch(60.125),
      width: inch(10),
    });
  });

  it("keeps the wood stock id stable for the shopping list", () => {
    expect(WOOD_ID).toBeTruthy();
  });
});
