// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model, solve step 7: "Display mesh … cached by definition hash". ADR 015, rule 10: a shape
// that cannot be built says why.

import { type PartShape, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { initGeometry } from "@kerf/geometry";
import { beforeAll, describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { meshFor, undrawnBoards } from "./meshes";

const shelf: PartShape = {
  definition: "a",
  name: "Shelf",
  length: 7_124_700,
  width: 2_387_600,
  thickness: 146_050,
  removals: [],
};

describe("meshFor()", () => {
  beforeAll(initGeometry);

  it("builds the same mesh once for two shapes with the same content", () => {
    const a = meshFor(shelf);
    const b = meshFor({ ...shelf, definition: "b" });
    expect(a.ok && b.ok && a.mesh === b.mesh).toBe(true);
  });

  it("says why a shape cannot be built instead of throwing", () => {
    const bad = { ...shelf, removals: [{ kind: "nonsense" }] } as unknown as PartShape;
    expect(meshFor(bad)).toMatchObject({ ok: false });
  });
});

describe("undrawnBoards()", () => {
  beforeAll(initGeometry);

  it("names the boards whose cuts cannot be drawn, for the badge in the view (ADR 015, rule 10)", () => {
    const result = solve(startProject("Bookcase", "imperial").project, loadShopProfile());
    const top = result.placements.find((p) => p.name === "Top");
    if (!top) throw new Error("no top");
    const broken = {
      ...result,
      shapes: result.shapes.map((s) =>
        s.definition === top.shape ? ({ ...s, removals: [{ kind: "nonsense" }] } as never) : s,
      ),
    };
    const undrawn = undrawnBoards(broken);
    expect([...undrawn.keys()]).toEqual([top.instance]);
    expect(undrawn.get(top.instance)).toMatch(/cannot be drawn/);
  });

  it("is empty when every board can be drawn with its cuts", () => {
    const result = solve(startProject("Bookcase", "imperial").project, loadShopProfile());
    expect(undrawnBoards(result).size).toBe(0);
  });
});
