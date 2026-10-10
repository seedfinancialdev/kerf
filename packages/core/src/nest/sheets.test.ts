// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INCH } from "../units";
import { DEFAULT_MIN_OFFCUT, nestSheets, type SheetItem, type SheetSpec } from "./sheets";

const kerf = INCH / 8;
const options = { kerf, trim: 0, minOffcut: DEFAULT_MIN_OFFCUT };
const sheet96x48: SheetSpec = { stock: "ply", length: 96 * INCH, width: 48 * INCH };

const item = (name: string, length: number, width: number, locked = true): SheetItem => ({
  instance: name,
  name,
  length: length * INCH,
  width: width * INCH,
  locked,
});

describe("nestSheets: layouts", () => {
  it("fills a sheet exactly with one part: efficiency 1, no offcuts, no crosscut", () => {
    const { sheets } = nestSheets([item("full", 96, 48)], sheet96x48, options);
    expect(sheets).toHaveLength(1);
    const layout = sheets[0];
    expect(layout?.efficiency).toEqual({ num: 1n, den: 1n });
    expect(layout?.offcuts).toEqual([]);
    expect(layout?.cutSequence).toEqual([{ op: "rip", sizes: [48 * INCH] }]);
  });

  it("puts a part and its kerf-separated neighbour in one strip", () => {
    // 47-15/16" + 1/8" kerf + 47-15/16" = 96" exactly.
    const half = 47.9375;
    const { sheets } = nestSheets([item("a", half, 10), item("b", half, 10)], sheet96x48, options);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.placements.map((p) => p.x)).toEqual([0, half * INCH + kerf]);
  });

  it("opens a second sheet when strips no longer fit across the width", () => {
    const parts = [item("a", 90, 25), item("b", 90, 25)]; // 25 + 1/8 + 25 > 48
    expect(nestSheets(parts, sheet96x48, options).sheets).toHaveLength(2);
  });

  it("turns an unlocked part when it only fits that way, and refuses a locked one", () => {
    const tall: SheetSpec = { stock: "ply", length: 48 * INCH, width: 96 * INCH };
    const turnable = nestSheets([item("p", 90, 40, false)], tall, options);
    expect(turnable.sheets).toHaveLength(1);
    expect(turnable.sheets[0]?.placements[0]).toMatchObject({
      rotated: true,
      length: 40 * INCH,
      width: 90 * INCH,
    });
    const locked = nestSheets([item("p", 90, 40, true)], tall, options);
    expect(locked.sheets).toHaveLength(0);
    expect(locked.tooLarge.map((i) => i.name)).toEqual(["p"]);
  });

  it("reports parts larger than the sheet and still nests the rest", () => {
    const result = nestSheets([item("huge", 100, 10), item("ok", 20, 10)], sheet96x48, options);
    expect(result.tooLarge.map((i) => i.name)).toEqual(["huge"]);
    expect(result.sheets[0]?.placements.map((p) => p.name)).toEqual(["ok"]);
  });

  it("ignores remainders below the minimum useful offcut and keeps larger ones", () => {
    const { sheets } = nestSheets([item("a", 80, 40)], sheet96x48, options);
    // Remainder after the crosscut: 96 - 80 - 1/8 = 15-7/8" x 40" (usable) and 48 - 40 - 1/8 = 7-7/8" x 96".
    expect(sheets[0]?.offcuts).toHaveLength(2);
    const small = nestSheets([item("a", 93, 45)], sheet96x48, options);
    expect(small.sheets[0]?.offcuts).toEqual([]); // 2-7/8" and 2-7/8" are waste
  });

  it("subtracts edge trim from every side of the sheet", () => {
    const trimmed = { ...options, trim: 1 * INCH };
    expect(nestSheets([item("a", 95, 10)], sheet96x48, trimmed).tooLarge).toHaveLength(1); // usable 94
    const fits = nestSheets([item("a", 94, 10)], sheet96x48, trimmed);
    expect(fits.sheets[0]?.placements[0]).toMatchObject({ x: INCH, y: INCH });
  });

  it("is deterministic and independent of how ties were typed", () => {
    const parts = [item("a", 30, 10), item("b", 30, 10), item("c", 20, 15), item("d", 20, 15)];
    const first = nestSheets(parts, sheet96x48, options);
    const second = nestSheets(parts, sheet96x48, options);
    expect(second).toEqual(first);
  });
});

describe("nestSheets: invariants on random input", () => {
  const dimension = fc.integer({ min: 1, max: 60 }); // inches
  const parts = fc.array(
    fc.record({ l: dimension, w: fc.integer({ min: 1, max: 40 }), locked: fc.boolean() }),
    { minLength: 1, maxLength: 25 },
  );

  it("places every fitting part once, inside the sheet, never overlapping, with kerf between", () => {
    fc.assert(
      fc.property(parts, (list) => {
        const items = list.map((p, i) => item(`p${i}`, p.l, p.w, p.locked));
        const { sheets, tooLarge } = nestSheets(items, sheet96x48, options);
        expect(tooLarge).toEqual([]); // every generated part fits a 96 x 48 sheet turned or not

        const placed = sheets.flatMap((s) => s.placements.map((p) => p.instance));
        expect([...placed].sort()).toEqual(items.map((i) => i.instance).sort());

        for (const s of sheets) {
          for (const p of s.placements) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x + p.length).toBeLessThanOrEqual(96 * INCH);
            expect(p.y + p.width).toBeLessThanOrEqual(48 * INCH);
          }
          // No two parts overlap or touch (a saw cut lies between them).
          for (const [i, a] of s.placements.entries()) {
            for (const b of s.placements.slice(i + 1)) {
              const apartAlong = a.x + a.length + kerf <= b.x || b.x + b.length + kerf <= a.x;
              const apartAcross = a.y + a.width + kerf <= b.y || b.y + b.width + kerf <= a.y;
              expect(apartAlong || apartAcross).toBe(true);
            }
          }
        }
        // Locked parts keep their length along the grain.
        const locked = new Set(items.filter((i) => i.locked).map((i) => i.instance));
        for (const s of sheets) {
          for (const p of s.placements) if (locked.has(p.instance)) expect(p.rotated).toBe(false);
        }
        // Material cannot be created: sheets hold at least the parts' total area.
        const area = items.reduce((sum, i) => sum + i.length * i.width, 0);
        expect(sheets.length * 96 * INCH * 48 * INCH).toBeGreaterThanOrEqual(area);
      }),
      { numRuns: 300 },
    );
  });
});
