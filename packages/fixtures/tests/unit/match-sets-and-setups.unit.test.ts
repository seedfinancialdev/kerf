// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { INCH, type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

{
  const shop = loadShopProfile();
  const inch = (n: number): number => n * INCH;
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
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

  describe("solid stock and match sets", () => {
    const k = 0.125;
    const members = (l: string): PartSpec[] => [wood("A", l, "4in"), wood("B", l, "4in")];
    const inst = [at("A", "0in"), at("B", "5in"), at("Lid", "10in")];
    it("seed 34in + a 37-7/8in lid fill a 72in board exactly: 33 + 1/8 + 37-7/8 = 71 = 72 - 1", () => {
      const p = boards([...members("16-7/16in"), wood("Lid", "37-7/8in", "4in")], inst, [], {
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
        woodLengths: [inch(48), inch(72), inch(96)],
      });
      const out = solve(p, shop).nesting.boards;
      expect(out.map((b) => b.boardLength)).toEqual([inch(72)]);
      expect(out[0]?.alsoOnBoard?.map((x) => x.name)).toEqual(["Lid"]);
    });
    it("equal totals: the shortest-first packing wins, so the 36in set gets the 48in board", () => {
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
    it("a set whose composite is exactly a standard length (48in) is placed, not an error", () => {
      const p = boards(members("23-7/16in"), [at("A", "0in"), at("B", "5in")], [], {
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
        woodLengths: [inch(48)],
      });
      const r = solve(p, shop);
      expect(r.diagnostics.map((d) => d.rule)).not.toContain("match-set-too-long");
      expect(r.nesting.boards.map((b) => b.boardLength)).toEqual([inch(48)]);
    });
    it("a side-by-side set exactly as wide as the widest board is allowed", () => {
      const p = boards(
        [wood("A", "10in", "3-15/16in"), wood("B", "10in", "3-15/16in")],
        [at("A", "0in"), at("B", "5in")],
        [],
        {
          matchSets: [
            { name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] },
          ],
        },
      );
      expect(rules(p)).not.toContain("error:part-too-wide");
    });
    it("a part exactly as wide as the widest board is allowed", () => {
      expect(rules(boards([wood("W", "10in", "8in")], [at("W", "0in")]))).not.toContain(
        "error:part-too-wide",
      );
    });
    it("a set's composite length includes the stock's length allowance: 2 x (10 + 1) + 1/8 + 1 trim", () => {
      const p = boards(members("10in"), [at("A", "0in"), at("B", "5in")], [], {
        matchSets: [{ name: "Wrap", type: "continuousGrain", members: ["A", "B"] }],
        woodAllowanceLength: INCH,
      });
      expect(solve(p, shop).nesting.boards[0]?.composite?.length).toBe(
        inch(10 + 1 + 10 + 1 + k + 1),
      );
    });
    it("a same-board set is laid end to end whatever axis is on it", () => {
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
    it("3 members along the grain on a sheet: 60 + 2 kerfs, not 3", () => {
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
    it("members side by side across the grain on a sheet", () => {
      const p = boards(
        [ply("A", "30in", "10in"), ply("B", "30in", "10in")],
        [at("A", "0in"), at("B", "12in")],
        [],
        {
          matchSets: [
            { name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] },
          ],
        },
      );
      const s = solve(p, shop).nesting.sheets[0];
      expect(s?.placements.map((x) => [x.name, x.x, x.y])).toEqual([
        ["A", 0, 0],
        ["B", 0, inch(10.125)],
      ]);
      expect(s?.cutSequence[0]).toEqual({ op: "rip", sizes: [inch(20.125)] });
    });
    it("a bookmatch set on sheet goods is nested as ordinary parts, so it may use two sheets", () => {
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
}

{
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
  const at = (name: string, y: string): InstanceSpec => ({
    name,
    part: name,
    at: ["0in", y, "0in"],
  });

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
          matchSets: [
            { name: "Panel", type: "continuousGrain", axis: "width", members: ["A", "B"] },
          ],
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
          matchSets: [
            { name: "Run", type: "continuousGrain", axis: "length", members: ["A", "B"] },
          ],
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
}

{
  const shop = loadShopProfile();
  const inch = (n: number): number => n * INCH;
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
  const at = (name: string, y: string): InstanceSpec => ({
    name,
    part: name,
    at: ["0in", y, "0in"],
  });

  describe("a same-board set must really fit the sheet", () => {
    const set = (members: string[]) => ({
      matchSets: [{ name: "Together", type: "sameBoard" as const, members }],
    });

    it("reports a member larger than the sheet instead of placing it off the edge", () => {
      const p = boards(
        [ply("Big", "100in", "10in"), ply("Small", "10in", "10in")],
        [at("Big", "0in"), at("Small", "12in")],
        [],
        set(["Big", "Small"]),
      );
      const result = solve(p, shop);
      expect(result.blocked).toBe(true);
      expect(result.diagnostics.map((d) => d.rule)).toContain("match-set-too-large");
      for (const s of result.nesting.sheets) {
        for (const x of s.placements) expect(x.x + x.length).toBeLessThanOrEqual(inch(96));
      }
    });

    it("turns an unlocked member that fits only the other way round", () => {
      const p = boards(
        [ply("Wide", "30in", "60in", { locked: false }), ply("Small", "10in", "10in")],
        [at("Wide", "0in"), at("Small", "70in")],
        [],
        set(["Wide", "Small"]),
      );
      const result = solve(p, shop);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const wide = result.nesting.sheets[0]?.placements.find((x) => x.name === "Wide");
      expect(wide?.rotated).toBe(true);
      expect((wide?.y ?? 0) + (wide?.width ?? 0)).toBeLessThanOrEqual(inch(48));
    });
  });

  describe("match sets on shared boards and cut sequences", () => {
    it("puts two continuous-grain sets that fit one board on one board", () => {
      const p = boards(
        [
          wood("A1", "10in", "4in"),
          wood("A2", "10in", "4in"),
          wood("B1", "10in", "4in"),
          wood("B2", "10in", "4in"),
        ],
        [at("A1", "0in"), at("A2", "5in"), at("B1", "10in"), at("B2", "15in")],
        [],
        {
          matchSets: [
            { name: "One", type: "continuousGrain", members: ["A1", "A2"] },
            { name: "Two", type: "continuousGrain", members: ["B1", "B2"] },
          ],
        },
      );
      const layouts = solve(p, shop).nesting.boards;
      expect(layouts).toHaveLength(2); // one per set
      expect(new Set(layouts.map((b) => b.boardIndex)).size).toBe(1); // on one board
    });

    it("cuts the blank out, then divides it into the members of a run on a sheet", () => {
      const p = boards(
        [ply("F1", "20in", "6in"), ply("F2", "20in", "6in"), ply("F3", "20in", "6in")],
        [at("F1", "0in"), at("F2", "7in"), at("F3", "14in")],
        [],
        {
          matchSets: [
            {
              name: "Fronts",
              type: "continuousGrain",
              axis: "length",
              members: ["F1", "F2", "F3"],
            },
          ],
        },
      );
      const sheet = solve(p, shop).nesting.sheets[0];
      expect(sheet?.cutSequence).toEqual([
        { op: "rip", sizes: [inch(6)] },
        { op: "crosscut", sizes: [inch(60.25)] }, // the blank: 3 x 20" and two 1/8" kerfs
        { op: "crosscut", sizes: [inch(20), inch(20), inch(20)] }, // then divided into the fronts
      ]);
    });
  });
}
