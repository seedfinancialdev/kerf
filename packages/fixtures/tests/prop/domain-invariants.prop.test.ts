// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Property tests: one per Domain model invariant, plus the harness checks from the Build plan
// (no throw, every mesh manifold, cut list equals part data, load -> save byte-identical).
// Skeletons at M0: each fails until the milestone it names is active.

import {
  buildCutList,
  deriveJointCuts,
  INCH,
  type Project,
  parseProject,
  serializeProject,
  solve,
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

function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) numbers(v, out);
  return out;
}

describe("saved file invariants", () => {
  milestone("M1", "every saved length is an integer; no floats in project.json", () => {
    property(anyProject, (p) => {
      for (const n of numbers(JSON.parse(serializeProject(p))))
        expect(Number.isInteger(n)).toBe(true);
    });
  });

  milestone("M1", "load -> save is byte-identical", () => {
    property(anyProject, (p) => {
      const text = serializeProject(p);
      expect(serializeProject(parseProject(text))).toBe(text);
    });
  });

  milestone("M1", "the saved file contains no derived data", () => {
    property(anyProject, (p) => {
      const text = serializeProject(p);
      for (const key of ["cutList", "removals", "mesh", "setups", "layouts"]) {
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
