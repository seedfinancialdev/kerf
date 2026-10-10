// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Property tests: one per Domain model invariant, plus the harness checks from the Build plan
// (no throw, every mesh manifold, cut list equals part data, load -> save byte-identical).
// Each test is gated by the milestone it belongs to (see milestones.json).

import {
  buildCutList,
  deriveJointCuts,
  INCH,
  layoutDovetail,
  type Project,
  ProjectFormatError,
  parseProject,
  serializeProject,
  solve,
  solveModel,
} from "@kerf/core";
import { buildDisplayMesh, initGeometry, isManifold } from "@kerf/geometry";
import fc from "fast-check";
import { describe, expect } from "vitest";
import { applyBookcaseEdit, applyBoxEdit, bookcaseEdit, boxEdit, RUNS } from "../../src/edits";
import { loadProject, loadShopProfile } from "../../src/index";
import { milestone } from "../../src/milestone";

const shop = loadShopProfile();
const bookcase = loadProject("bookcase");
const box = loadProject("box");

const editedBookcase = bookcaseEdit.map((e) => applyBookcaseEdit(bookcase, e));
const editedBox = boxEdit.map((e) => applyBoxEdit(box, e));
const anyProject = fc.oneof(editedBookcase, editedBox);

function property<T>(arb: fc.Arbitrary<T>, check: (value: T) => void): void {
  fc.assert(
    fc.property(arb, (value) => check(value)),
    { numRuns: RUNS },
  );
}

describe("saved file and solver invariants (M1)", () => {
  const orientations = fc.array(fc.integer({ min: 0, max: 23 }), { minLength: 9, maxLength: 9 });
  const wild = fc.record({
    edit: bookcaseEdit,
    units: fc.constantFrom("imperial", "metric"),
    orientations,
  });

  const scrambled = (w: {
    edit: Parameters<typeof applyBookcaseEdit>[1];
    units: string;
    orientations: number[];
  }) => {
    const p = applyBookcaseEdit(bookcase, w.edit);
    return {
      ...p,
      units: w.units as Project["units"],
      instances: p.instances.map((i, n) => ({ ...i, orientation: w.orientations[n] ?? 0 })),
    };
  };

  milestone(
    "M1",
    "solving never throws, never changes the project, and returns only safe integers",
    () => {
      property(wild, (w) => {
        const p = scrambled(w);
        const before = serializeProject(p);
        const model = solveModel(p);
        expect(serializeProject(p)).toBe(before);
        const lengths: number[] = [];
        for (const part of model.parts) lengths.push(part.length, part.width, part.thickness);
        for (const i of model.instances) {
          lengths.push(
            i.position.x,
            i.position.y,
            i.position.z,
            i.extent.x,
            i.extent.y,
            i.extent.z,
          );
        }
        for (const n of lengths) expect(Number.isSafeInteger(n)).toBe(true);
      });
    },
  );

  milestone(
    "M1",
    "the assembled bookcase is exactly width x depth x height after any resize",
    () => {
      property(bookcaseEdit, (edit) => {
        const model = solveModel(applyBookcaseEdit(bookcase, edit));
        expect(model.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        const max = { x: 0, y: 0, z: 0 };
        for (const i of model.instances) {
          for (const a of ["x", "y", "z"] as const)
            max[a] = Math.max(max[a], i.position[a] + i.extent[a]);
        }
        const quarter = INCH / 4;
        expect(max).toEqual({
          x: edit.width * quarter,
          y: edit.depth * quarter,
          z: edit.height * quarter,
        });
      });
    },
  );

  milestone(
    "M1",
    "any text in names, notes and options survives load -> save byte-identically",
    () => {
      const text = fc.string({ unit: "grapheme" });
      const arbitrary = fc.record({
        name: text,
        notes: text,
        options: fc.dictionary(text, fc.oneof(text, fc.boolean())),
      });
      property(arbitrary, ({ name, notes, options }) => {
        const p: Project = {
          ...bookcase,
          name,
          parts: bookcase.parts.map((part, i) => (i === 0 ? { ...part, notes } : part)),
          structures: [
            {
              id: "01K7M3Q8ZD00000000F2000001",
              type: "case",
              size: { w: "36in", h: "72in", d: "12in" },
              options,
              openings: [],
            },
          ],
        };
        const saved = serializeProject(p);
        expect(serializeProject(parseProject(saved))).toBe(saved);
        expect(parseProject(saved)).toEqual(p);
      });
    },
  );

  milestone("M1", "a non-integer in any saved number is refused at load", () => {
    const where = fc.constantFrom(
      (p: Project, v: number) => ({
        ...p,
        stock: p.stock.map((s, i) => (i === 0 ? { ...s, thickness: v } : s)),
      }),
      (p: Project, v: number) => ({
        ...p,
        stock: p.stock.map((s, i) =>
          i === 0 ? { ...s, allowance: { ...s.allowance, width: v } } : s,
        ),
      }),
      (p: Project, v: number) => ({
        ...p,
        instances: p.instances.map((x, i) => (i === 0 ? { ...x, orientation: v } : x)),
      }),
    );
    const fraction = fc
      .double({ min: -1e6, max: 1e6, noNaN: true })
      .filter((n) => !Number.isInteger(n));
    property(fc.tuple(where, fraction), ([edit, v]) => {
      const text = JSON.stringify(edit(bookcase, v));
      expect(() => parseProject(text)).toThrow(ProjectFormatError);
    });
  });

  milestone("M1", "the saved file contains no solver results", () => {
    property(anyProject, (p) => {
      solveModel(p);
      const text = serializeProject(p);
      for (const key of ["cutList", "removals", "mesh", "setups", "layouts", "extent"]) {
        expect(text).not.toContain(`"${key}"`);
      }
    });
  });
});

describe("solve invariants", () => {
  milestone("M2", "a valid edit never throws and raises no error", () => {
    property(anyProject, (p) => {
      const { diagnostics } = solve(p, shop);
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });
  });

  milestone("M2", "every display mesh is manifold", async () => {
    await initGeometry();
    property(anyProject, (p: Project) => {
      for (const shape of solve(p, shop).shapes) {
        expect(isManifold(buildDisplayMesh(shape, shape.removals))).toBe(true);
      }
    });
  });

  milestone("M2", "the cut list is a pure function of project.json", () => {
    property(anyProject, (p) => {
      const reloaded = parseProject(serializeProject(p));
      expect(buildCutList(reloaded)).toEqual(buildCutList(p));
    });
  });

  milestone("M2", "grouping key is unique, and quantities add up to the part count", () => {
    property(editedBookcase, (p) => {
      const { lines, blocks } = buildCutList(p);
      const keys = lines.map((l) => [l.stock, l.length, l.width, l.thickness].join("/"));
      expect(new Set(keys).size).toBe(keys.length);
      const shelves = Number(p.params.find((x) => x.name === "shelf_count")?.expr);
      const total =
        lines.reduce((sum, l) => sum + l.quantity, 0) +
        blocks.reduce((sum, b) => sum + b.members.length, 0);
      expect(total).toBe(5 + shelves);
    });
  });

  milestone("M2", "match-set members stay together, in order, as one block", () => {
    property(editedBox, (p) => {
      const { blocks } = buildCutList(p);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.members.map((m) => m.sequence)).toEqual([1, 2, 3, 4]);
    });
  });

  milestone("M2", "mirroring never changes a cut-list line", () => {
    property(editedBookcase, (p) => {
      const flipped: Project = {
        ...p,
        instances: p.instances.map((i) => ({ ...i, mirrored: !i.mirrored })),
      };
      expect(buildCutList(flipped)).toEqual(buildCutList(p));
    });
  });

  milestone("M2", "two instances of one definition have identical cuts", () => {
    property(editedBookcase, (p) => {
      const dados = p.joints.filter((j) => j.type === "dado");
      expect(dados).toHaveLength(2);
      const [a, b] = dados;
      expect(deriveJointCuts(p, a?.id ?? "")).toEqual(deriveJointCuts(p, b?.id ?? ""));
    });
  });
});

describe("outputs invariants", () => {
  milestone("M2", "solving is deterministic and never falls back to internal-error", () => {
    property(anyProject, (p) => {
      const first = solve(p, shop);
      expect(first.diagnostics.map((d) => d.rule)).not.toContain("internal-error");
      expect(
        JSON.stringify(solve(p, shop), (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      ).toBe(JSON.stringify(first, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    });
  });

  milestone("M2", "every part is placed exactly once, on a sheet or a board", () => {
    property(anyProject, (p) => {
      const result = solve(p, shop);
      const cut =
        result.cutList.lines.reduce((sum, l) => sum + l.quantity, 0) +
        result.cutList.blocks.reduce((sum, b) => sum + b.members.length, 0);
      const onSheets = result.nesting.sheets.reduce((sum, s) => sum + s.placements.length, 0);
      const onBoards = result.nesting.boards.reduce((sum, b) => sum + b.sequence.length, 0);
      expect(onSheets + onBoards).toBe(cut);
    });
  });

  milestone("M2", "sheet contents match placements, and efficiency is a fraction up to 1", () => {
    property(editedBookcase, (p) => {
      for (const sheet of solve(p, shop).nesting.sheets) {
        expect(sheet.efficiency.num).toBeGreaterThan(0n);
        expect(sheet.efficiency.num <= sheet.efficiency.den).toBe(true);
        expect(sheet.contents.reduce((n, c) => n + c.quantity, 0)).toBe(sheet.placements.length);
      }
    });
  });

  milestone("M2", "cut size is visible size plus what joints add, never less", () => {
    property(editedBookcase, (p) => {
      for (const line of solve(p, shop).cutList.lines) {
        expect(line.length).toBeGreaterThanOrEqual(line.visible.length);
        expect(line.width).toBeGreaterThanOrEqual(line.visible.width);
      }
    });
  });
});

describe("stronger M2 properties", () => {
  const GRID = INCH / 64;

  milestone(
    "M2",
    "a dovetail layout always fills the board exactly, on the grid, odd step to edge0",
    () => {
      const input = fc.record({
        width: fc.integer({ min: 64, max: 1600 }), // 1" to 25", in 64ths
        tails: fc.integer({ min: 1, max: 8 }),
        pin: fc.integer({ min: 8, max: 64 }),
        mating: fc.integer({ min: 16, max: 96 }),
        slope: fc.integer({ min: 5, max: 10 }),
        metric: fc.boolean(),
      });
      property(input, (i) => {
        const units = i.metric ? "metric" : "imperial";
        const grid = i.metric ? 80 : GRID;
        // Inputs sit on the unit system's grid, like every solved length: 1/64" or 0.01 mm.
        const q = (n: number): number => (i.metric ? n * 80 * 40 : n * GRID);
        const layout = layoutDovetail(
          {
            boardWidth: q(i.width),
            tails: i.tails,
            pin: q(i.pin),
            matingThickness: q(i.mating),
            slope: i.slope,
          },
          units,
        );
        if ("problem" in layout) return; // a valid refusal; the other cases hold for what is accepted
        const { tails, halfPins, wideTailWidth, narrowTailWidth, slopeOffset } = layout;
        // Tails, pins and half-pins add up to the board's width, exactly.
        const pins = (i.tails - 1) * q(i.pin);
        expect(halfPins[0] + halfPins[1] + i.tails * wideTailWidth + pins).toBe(q(i.width));
        // The leftover is shared out in whole grid steps; the odd step goes to edge0.
        const extra0 = (halfPins[0] - q(i.pin)) / grid;
        const extra1 = (halfPins[1] - q(i.pin)) / grid;
        expect(Number.isInteger(extra0) && Number.isInteger(extra1)).toBe(true);
        expect(extra0 - extra1 === 0 || extra0 - extra1 === 1).toBe(true);
        expect(wideTailWidth % grid).toBe(0);
        expect(narrowTailWidth).toBe(wideTailWidth - 2 * slopeOffset);
        // Tails are in order, inside the board, a pin apart.
        expect(tails).toHaveLength(i.tails);
        for (const [k, t] of tails.entries()) {
          expect(t.end - t.start).toBe(wideTailWidth);
          const next = tails[k + 1];
          if (next) expect(next.start - t.end).toBe(q(i.pin));
        }
      });
    },
  );

  milestone(
    "M2",
    "solving random units and orientations never falls back to internal-error",
    () => {
      const wild = fc.record({
        edit: bookcaseEdit,
        units: fc.constantFrom("imperial", "metric"),
        orientations: fc.array(fc.integer({ min: 0, max: 23 }), { minLength: 9, maxLength: 9 }),
      });
      property(wild, (w) => {
        const base = applyBookcaseEdit(bookcase, w.edit);
        const p: Project = {
          ...base,
          units: w.units as Project["units"],
          instances: base.instances.map((x, n) => ({ ...x, orientation: w.orientations[n] ?? 0 })),
        };
        const before = JSON.stringify(p);
        const result = solve(p, shop);
        expect(result.diagnostics.map((d) => d.rule)).not.toContain("internal-error");
        expect(JSON.stringify(p)).toBe(before);
        // Whatever it concludes, it concludes the same way twice.
        const again = solve(p, shop);
        expect(again.diagnostics).toEqual(result.diagnostics);
        expect(again.blocked).toBe(result.blocked);
      });
    },
  );

  milestone(
    "M2",
    "each bookcase line's cut size is its visible size plus exactly what its joints add",
    () => {
      property(editedBookcase, (p) => {
        const add: Record<string, [number, number]> = {
          Side: [0, 0],
          Top: [32 * GRID, 0], // 2 x 1/4" at the two end rabbets
          Bottom: [32 * GRID, 0],
          Shelf: [32 * GRID, 0], // 2 x 1/4" in the dados
          Back: [0, 48 * GRID], // 2 x 3/8" in the back rabbets
        };
        for (const line of solve(p, shop).cutList.lines) {
          for (const part of line.parts) {
            const [dl, dw] = add[part.name] ?? [Number.NaN, Number.NaN];
            expect(line.length - line.visible.length).toBe(dl);
            expect(line.width - line.visible.width).toBe(dw);
          }
        }
      });
    },
  );

  milestone("M2", "every error or warning says which part, joint or field it is about", () => {
    property(anyProject, (p) => {
      for (const d of solve(p, shop).diagnostics) {
        if (d.severity === "info") continue;
        expect(d.field !== undefined || d.part !== undefined || d.joint !== undefined).toBe(true);
      }
    });
  });
});

describe("resize keeps joinery true (charter question 3)", () => {
  milestone("M2", 'dado depth stays 1/4" and panel thickness never changes', () => {
    property(editedBookcase, (p) => {
      const dado = p.joints.find((j) => j.type === "dado");
      expect(deriveJointCuts(p, dado?.id ?? "").guestCutAdd.length).toBe(INCH / 4);
      const thicknesses = new Set(p.stock.map((s) => s.thickness));
      for (const line of buildCutList(p).lines) expect(thicknesses.has(line.thickness)).toBe(true);
    });
  });
});
