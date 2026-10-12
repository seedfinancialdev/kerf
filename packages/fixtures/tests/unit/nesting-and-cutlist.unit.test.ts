// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { INCH, nest, type Project, solve } from "@kerf/core";
import { nestSheets } from "@kerf/core/internal";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadExpected, loadProject, loadShopProfile } from "../../src/index";

{
  const shop = loadShopProfile();

  describe("nesting choices", () => {
    const part = (name: string, locked: boolean): PartSpec => ({
      name,
      length: "45in",
      width: "30in",
      thickness: "3/4in",
      locked,
    });
    const six = (locked: boolean, extras = {}): Project =>
      boards(
        Array.from({ length: 6 }, (_, i) => part(`P${i}`, locked)),
        Array.from(
          { length: 6 },
          (_, i): InstanceSpec => ({
            name: `P${i}`,
            part: `P${i}`,
            at: [`${i * 50}in`, "0in", "0in"],
          }),
        ),
        [],
        extras,
      );

    it("rotates unlocked parts to save a sheet: 6 parts of 45 x 30 need 2 sheets, 3 when locked", () => {
      // Locked: 45 along the grain, two per strip (90-1/8"), one strip across (30 + 30 + 1/8 > 48): 3 sheets.
      expect(nest(six(true), shop).sheets).toHaveLength(3);
      // Unlocked: 30 along, three per strip (90-1/4"), 45 across: one strip per sheet, 2 sheets.
      const unlocked = nest(six(false), shop);
      expect(unlocked.sheets).toHaveLength(2);
      expect(unlocked.sheets.flatMap((s) => s.placements).every((p) => p.rotated)).toBe(true);
    });

    it("a sheet with no grain lets even locked parts turn", () => {
      expect(nest(six(true, { plyGrain: "none" }), shop).sheets).toHaveLength(2);
    });

    it("uses the shop's kerf, not a built-in one", () => {
      const part10: PartSpec = { name: "A", length: "10in", width: "5in", thickness: "3/4in" };
      const p = boards(
        [part10, { ...part10, name: "B" }],
        [
          { name: "A", part: "A", at: ["0in", "0in", "0in"] },
          { name: "B", part: "B", at: ["0in", "10in", "0in"] },
        ],
      );
      const wide = nest(p, { ...shop, kerf: INCH / 4 });
      expect(wide.sheets[0]?.placements.map((x) => x.x)).toEqual([0, 10 * INCH + INCH / 4]);
    });

    it("reports the 3/4in sheets' efficiency as the spec's 'about 46%'", () => {
      // Exact: used area (2 x 72 x 12 + 6 x 35-1/16 x 11-3/4) over two 96 x 48 sheets is
      // 3,375.9375 x 2 ... = 44799 / 98304 = 45.6%, which the spec rounds to 46%.
      const bookcase = loadProject("bookcase");
      const threeQuarter = bookcase.stock.find((x) => x.name === "3/4 plywood")?.id;
      const sheets = nest(bookcase, shop).sheets.filter((s) => s.stock === threeQuarter);
      expect(sheets).toHaveLength(2);
      const [a, b] = sheets.map((x) => x.efficiency);
      if (!a || !b) throw new Error("expected two sheets");
      // (a + b) / 2 == 44799 / 98304, compared without division.
      expect((a.num * b.den + b.num * a.den) * 98304n).toBe(44799n * 2n * a.den * b.den);
      const expected = loadExpected<{ efficiencyPercentApprox: Record<string, number> }>(
        "bookcase",
        "layouts",
      );
      expect(Object.values(expected.efficiencyPercentApprox)).toContain(
        Math.round((44799 / 98304) * 100),
      );
    });

    it("flags stock with no sizes and does not nest its parts", () => {
      const wood: PartSpec = {
        name: "W",
        length: "10in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const p = boards([wood], [{ name: "W", part: "W", at: ["0in", "0in", "0in"] }], [], {
        woodWithoutSizes: true,
      });
      const result = solve(p, shop);
      expect(result.diagnostics.map((d) => `${d.severity}:${d.rule}`)).toContain(
        "warning:no-stock-sizes",
      );
      expect(result.nesting.boards).toEqual([]);
    });

    it("adds the stock's length allowance to solid parts before packing", () => {
      const long: PartSpec = {
        name: "L",
        length: "47in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const parts = [long, { ...long, name: "M" }];
      const at: InstanceSpec[] = [
        { name: "L", part: "L", at: ["0in", "0in", "0in"] },
        { name: "M", part: "M", at: ["0in", "5in", "0in"] },
      ];
      // 47 + 1/8 + 47 = 94-1/8 fits one 96" board (95" usable); with 1/2" allowance each: 95-1/8, too long.
      expect(nest(boards(parts, at), shop).boards).toHaveLength(1);
      expect(
        nest(boards(parts, at, [], { woodAllowanceLength: INCH / 2 }), shop).boards,
      ).toHaveLength(2);
    });
  });

  describe("cut-list key includes thickness and width", () => {
    it("keeps parts of the same length but different thickness or width on separate lines", () => {
      const parts: PartSpec[] = [
        { name: "A", length: "20in", width: "10in", thickness: "3/4in" },
        { name: "B", length: "20in", width: "10in", thickness: "1/2in" },
        { name: "C", length: "20in", width: "8in", thickness: "3/4in" },
      ];
      const at: InstanceSpec[] = parts.map((p, i) => ({
        name: p.name,
        part: p.name,
        at: [`${i * 30}in`, "0in", "0in"],
      }));
      expect(solve(boards(parts, at), shop).cutList.lines).toHaveLength(3);
    });
  });
}

{
  const inch = (n: number): number => n * INCH;

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
    it("strips that exactly fill the sheet width fit on one sheet: 24 + 1/8 + 23-7/8 = 48", () => {
      const r = nestSheets([it_("a", 96, 24), it_("b", 96, 23.875)], sheet(96, 48), opts);
      expect(r.sheets).toHaveLength(1);
    });
    it("a strip exactly 6in wide leaves a usable offcut: x 7, length 17, width 6", () => {
      const r = nestSheets([it_("a", 7, 6)], sheet(24, 12), { ...opts, kerf: 0 });
      expect(r.sheets[0]?.offcuts).toContainEqual({
        x: inch(7),
        y: 0,
        length: inch(17),
        width: inch(6),
      });
    });
    it("edge trim moves offcuts and shrinks the usable width: 48 x 24 sheet, 1/2in trim", () => {
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
    it("a sheet exactly 6in long still reports the 6 x 38 strip left across it", () => {
      const r = nestSheets([it_("a", 6, 10)], sheet(6, 48), { ...opts, kerf: 0 });
      expect(r.sheets[0]?.offcuts).toEqual([
        { x: 0, y: inch(10), length: inch(6), width: inch(38) },
      ]);
    });
    it("a square part is never reported as rotated", () => {
      const r = nestSheets([it_("long", 6, 19, false), it_("sq", 5, 5, false)], sheet(24, 48), {
        kerf,
        trim: inch(0.5),
        minOffcut: 6 * INCH,
      });
      const rot = Object.fromEntries(
        (r.sheets[0]?.placements ?? []).map((p) => [p.name, p.rotated]),
      );
      expect(rot).toEqual({ long: true, sq: false });
    });
    it("equal candidates: the earliest (natural orientation) wins", () => {
      const r = nestSheets([it_("sq", 11, 11, false)], sheet(24, 24), opts);
      expect(r.sheets[0]?.placements[0]?.rotated).toBe(false);
    });
    it("two offcuts of equal area: the first is the largest (8 x 26, not 13 x 16)", () => {
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
    it("only offcuts of the same length AND width are counted with the largest", () => {
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
    it("identical parts keep project order", () => {
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
    it("an offcut whose strip is exactly 6in wide still counts when choosing a layout", () => {
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
}
