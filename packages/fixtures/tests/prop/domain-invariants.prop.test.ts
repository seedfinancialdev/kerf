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
  type Project,
  ProjectFormatError,
  parseProject,
  serializeProject,
  solve,
  solveModel,
} from "@kerf/core";
import { buildDisplayMesh, isManifold } from "@kerf/geometry";
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

  milestone("M2", "every display mesh is manifold", () => {
    property(anyProject, (p: Project) => {
      for (const line of buildCutList(p).lines) {
        const mesh = buildDisplayMesh(
          { length: line.length, width: line.width, thickness: line.thickness },
          p.joints.flatMap((j) => deriveJointCuts(p, j.id).host),
        );
        expect(isManifold(mesh)).toBe(true);
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
