// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline steps 1-3 on the reference projects (Domain model v0, "Solve pipeline").
// Milestone M1. Cut-list and joinery results are M2; only sizes, instances and patterns here.

import { INCH, type Project, solveModel } from "@kerf/core";
import { describe, expect } from "vitest";
import { loadProject, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";

const fraction = (whole: number, num: number, den: number): number =>
  whole * INCH + (num * INCH) / den;

function part(project: Project, name: string) {
  const solved = solveModel(project).parts.find((p) => p.name === name);
  if (!solved) throw new Error(`no solved part ${name}`);
  return solved;
}

describe("bookcase parameters and part sizes", () => {
  const bookcase = loadProject("bookcase");

  milestone("M1", "solves with no diagnostics", () => {
    expect(solveModel(bookcase).diagnostics).toEqual([]);
  });

  milestone("M1", "side: 72 x 12 x 23/32", () => {
    expect(part(bookcase, "Side")).toMatchObject({
      length: 72 * INCH,
      width: 12 * INCH,
      thickness: fraction(0, 23, 32),
    });
  });

  milestone("M1", "top, bottom and shelf: 34-9/16 visible length x 11-3/4 wide", () => {
    for (const name of ["Top", "Bottom", "Shelf"]) {
      expect(part(bookcase, name)).toMatchObject({
        length: fraction(34, 9, 16),
        width: fraction(11, 3, 4),
        thickness: fraction(0, 23, 32),
      });
    }
  });

  milestone("M1", "back: 72 x 34-9/16 visible width x 1/4", () => {
    expect(part(bookcase, "Back")).toMatchObject({
      length: 72 * INCH,
      width: fraction(34, 9, 16),
      thickness: INCH / 4,
    });
  });

  milestone("M1", 'resize to 30": shelves become 28-9/16 and the thickness stays 23/32', () => {
    const narrow = withParam(bookcase, "width", "30in");
    expect(part(narrow, "Shelf")).toMatchObject({
      length: fraction(28, 9, 16),
      thickness: fraction(0, 23, 32),
    });
  });
});

describe("bookcase instances and patterns", () => {
  const bookcase = loadProject("bookcase");

  milestone("M1", "expands the shelf pattern to 4 shelves, 1 to 8 on a count change", () => {
    const shelves = (p: Project) =>
      solveModel(p).instances.filter((i) => i.pattern !== undefined).length;
    expect(shelves(bookcase)).toBe(4);
    expect(shelves(withParam(bookcase, "shelf_count", "8"))).toBe(8);
  });

  milestone("M1", "6 non-shelf placements: 2 sides, top, bottom and back, plus 4 shelves", () => {
    expect(solveModel(bookcase).instances).toHaveLength(9);
  });

  milestone("M1", "shelves are evenly spaced between the top and bottom faces", () => {
    const { instances } = solveModel(bookcase);
    const shelves = instances.filter((i) => i.pattern !== undefined);
    const bottomTop = fraction(0, 23, 32);
    const topBottom = 72 * INCH - fraction(0, 23, 32);
    const sorted = [...shelves].sort((a, b) => a.position.z - b.position.z);
    const gaps: number[] = [];
    let previousTop = bottomTop;
    for (const shelf of sorted) {
      gaps.push(shelf.position.z - previousTop);
      previousTop = shelf.position.z + shelf.extent.z;
    }
    gaps.push(topBottom - previousTop);
    // Each position snaps to 1/64", so gaps agree within one grid step.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(INCH / 64);
  });

  milestone("M1", "the mirrored side is placed like any other", () => {
    const left = solveModel(bookcase).instances.find((i) => i.name === "Left side");
    expect(left?.mirrored).toBe(true);
    expect(left?.position.x).toBe(36 * INCH - fraction(0, 23, 32));
  });
});

describe("keepsake box sizes", () => {
  const box = loadProject("box");

  milestone("M1", "front/back 10 x 4 x 1/2, sides 6 x 4 x 1/2", () => {
    expect(part(box, "Front")).toMatchObject({
      length: 10 * INCH,
      width: 4 * INCH,
      thickness: INCH / 2,
    });
    expect(part(box, "Side")).toMatchObject({
      length: 6 * INCH,
      width: 4 * INCH,
      thickness: INCH / 2,
    });
  });

  milestone("M1", 'bottom visible size is the 9" x 5" interior', () => {
    expect(part(box, "Bottom")).toMatchObject({
      length: 9 * INCH,
      width: 5 * INCH,
      thickness: INCH / 4,
    });
  });
});

describe("diagnostics", () => {
  const bookcase = loadProject("bookcase");

  milestone("M1", "a cycle names every member and solves nothing that depends on it", () => {
    const cyclic = withParam(withParam(bookcase, "width", "height + 1in"), "height", "width - 1in");
    const { diagnostics, params } = solveModel(cyclic);
    const cycle = diagnostics.find((d) => d.rule === "parameter-cycle");
    expect(cycle?.message).toContain('"width"');
    expect(cycle?.message).toContain('"height"');
    expect(params.width).toBeUndefined();
    expect(params.height).toBeUndefined();
    expect(params.depth).toBeDefined();
  });

  milestone("M1", "an unknown name is reported on its field", () => {
    const broken = withParam(bookcase, "width", "wdith * 2");
    const found = solveModel(broken).diagnostics.find((d) => d.rule === "unknown-reference");
    expect(found?.field).toBe("width");
  });

  milestone("M1", "a length parameter given a bare number is a type mismatch", () => {
    const broken = withParam(bookcase, "height", "72");
    expect(solveModel(broken).diagnostics.map((d) => d.rule)).toContain("type-mismatch");
  });

  milestone("M1", "a non-whole shelf count is rejected", () => {
    const broken = withParam(bookcase, "shelf_count", "7/2");
    expect(solveModel(broken).diagnostics.map((d) => d.rule)).toContain("type-mismatch");
  });
});
