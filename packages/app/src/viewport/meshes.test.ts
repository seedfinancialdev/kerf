// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model, solve step 7: "Display mesh … cached by definition hash". ADR 015, rule 10: a shape
// that cannot be built says why.

import type { PartShape } from "@kerf/core";
import { initGeometry } from "@kerf/geometry";
import { beforeAll, describe, expect, it } from "vitest";
import { meshFor } from "./meshes";

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
