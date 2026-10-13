// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 10 and the second-pass review M3: a board whose cuts the geometry engine fails on
// (it throws, rather than refusing the shape) is still drawn as its blank with a warning badge and
// its reason in the inspector, and the engine is not asked again for that shape on every frame.
// The engine is not loaded in this file, so every call into it fails the way a broken engine does.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { startProject } from "../model/commands";
import { meshFor, undrawnBoards } from "./meshes";

const result = solve(startProject("Bookcase", "imperial").project, loadShopProfile());
const FAULT = "the 3D view's drawing engine failed on this board.";

describe("a geometry engine that fails on a shape", () => {
  let logged: MockInstance;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  it("gives the board a reason in shop words instead of throwing, and asks the engine once per recorded change", () => {
    const [shape] = result.shapes;
    if (!shape) throw new Error("no shape");
    // Two renders of one History entry (a drag's preview frames) ask once; a new entry asks again,
    // so a passing fault is not remembered for the session (second-pass re-review, minor 3).
    const entry = {};
    expect(meshFor(shape, entry)).toEqual({ ok: false, reason: FAULT });
    expect(meshFor(shape, entry)).toEqual({ ok: false, reason: FAULT });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(meshFor(shape, {})).toEqual({ ok: false, reason: FAULT });
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it("names every such board for the badge and the inspector", () => {
    const undrawn = undrawnBoards(result, {});
    expect(undrawn.size).toBe(result.placements.length);
    const top = result.placements.find((p) => p.name === "Top");
    expect(top && undrawn.get(top.instance)).toBe(FAULT);
  });
});
