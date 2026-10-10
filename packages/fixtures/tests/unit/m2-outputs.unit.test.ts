// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Output defects from the M2 reviews (match sets, labels, setups), each written to fail first.
// Expected values are hand calculations from "Cut list & nesting".

import { INCH, type Project, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;
const wood = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "1/2in",
  stock: "wood",
});
const ply = (name: string, l: string, w: string): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
});
const at = (name: string, y: string): InstanceSpec => ({ name, part: name, at: ["0in", y, "0in"] });

describe("a match set nests as one unit, then the rest pack around it", () => {
  it("lets other solid-stock parts share the match set's board", () => {
    // Composite 30 + 1/8 + 30 + 1" trim = 61-1/8"; a 20" lid fits on the same 96" board (95" usable).
    const p = boards(
      [wood("A", "30in", "4in"), wood("B", "30in", "4in"), wood("Lid", "20in", "4in")],
      [at("A", "0in"), at("B", "5in"), at("Lid", "10in")],
      [],
      { matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }] },
    );
    const { boards: layouts } = solve(p, shop).nesting;
    expect(layouts).toHaveLength(1);
    expect(layouts[0]?.matchSet).toBeDefined();
    expect(layouts[0]?.sequence.map((s) => s.name)).toEqual(["A", "B"]); // the set stays 1-2 of 2
    expect(layouts[0]?.alsoOnBoard?.map((s) => s.name)).toEqual(["Lid"]);
  });

  it("lets other sheet parts share the sheet of a same-board set", () => {
    const p = boards(
      [ply("A", "20in", "10in"), ply("B", "20in", "10in"), ply("C", "20in", "10in")],
      [at("A", "0in"), at("B", "11in"), at("C", "22in")],
      [],
      { matchSets: [{ name: "Together", type: "sameBoard", members: ["A", "B"] }] },
    );
    expect(solve(p, shop).nesting.sheets).toHaveLength(1);
  });
});

describe("continuous grain side by side", () => {
  it("lays members across the width on solid stock: 10 x (3 + 1/8 + 3) plus trim", () => {
    const p = boards(
      [wood("A", "10in", "3in"), wood("B", "10in", "3in")],
      [at("A", "0in"), at("B", "4in")],
      [],
      {
        matchSets: [{ name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] }],
      },
    );
    const set = solve(p, shop).nesting.boards[0];
    // Along the board: one part's length plus trim at both ends; across it: widths and a kerf.
    expect(set?.composite).toEqual({
      length: inch(10) + inch(1),
      width: inch(6) + inch(0.125),
      widthAllowance: 0,
    });
  });
});

describe("members of a set on sheet goods are labelled", () => {
  it("lists each member with its place in the sequence", () => {
    const p = boards(
      [ply("A", "30in", "10in"), ply("B", "30in", "10in")],
      [at("A", "0in"), at("B", "12in")],
      [],
      {
        matchSets: [{ name: "Run", type: "continuousGrain", axis: "length", members: ["A", "B"] }],
      },
    );
    const sheet = solve(p, shop).nesting.sheets[0];
    expect(sheet?.placements.map((x) => [x.name, x.sequence])).toEqual([
      ["A", { n: 1, of: 2 }],
      ["B", { n: 2, of: 2 }],
    ]);
    // A is cut first, B follows after the kerf.
    expect(sheet?.placements.map((x) => x.x)).toEqual([0, inch(30.125)]);
  });
});

describe("cut list visible sizes", () => {
  it("says so when merged parts have different visible sizes", () => {
    // G (4") gets 1/4" from a dado; J is 4-1/4" with no joint: the same cut size, a different
    // visible size. They merge (the key is the cut size) but the line says the visible size varies.
    const host = ply("Host", "12in", "6in");
    const g: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/2in" };
    const j: PartSpec = {
      name: "J",
      length: "4.25in".replace("4.25", "4-1/4"),
      width: "5in",
      thickness: "1/2in",
    };
    const p = boards(
      [host, g, j],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["2in", "2in", "3/4in"], orientation: 16 },
        { name: "J", part: "J", at: ["0in", "20in", "0in"] },
      ],
      [{ type: "dado", host: "Host", guest: "G" }],
    );
    const line = solve(p, shop).cutList.lines.find((l) => l.parts.length === 2);
    expect(line?.quantity).toBe(2);
    expect(line?.visibleVaries).toBe(true);
  });

  it("does not claim it for the reference bookcase", () => {
    const lines = solve(loadProject("bookcase"), shop).cutList.lines;
    for (const line of lines) expect(line.visibleVaries).toBeUndefined();
  });
});

describe("machining setups list their parts", () => {
  it("names the parts and how many cuts each takes", () => {
    const setups = solve(loadProject("bookcase"), shop).setups;
    expect(setups[0]?.parts).toEqual([
      { name: "Right side", cuts: 6 },
      { name: "Left side", cuts: 6 },
    ]);
    expect(setups[2]?.parts).toEqual([
      { name: "Shelf 1", cuts: 2 },
      { name: "Shelf 2", cuts: 2 },
      { name: "Shelf 3", cuts: 2 },
      { name: "Shelf 4", cuts: 2 },
    ]);
  });
});

describe("not a bug, but written down", () => {
  it("keeps unused types out of the test", () => {
    const p: Project | undefined = undefined;
    expect(p).toBeUndefined();
  });
});
