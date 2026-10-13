// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Tape: Measure, add guide lines". Lengths stay integers: the straight distance
// is the exact square root snapped once to the grid, half to even (Domain model, "Units & precision").

import type { PlacedPart } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import type { ModelPointer } from "./handler";
import { measureBetween, tapeTool } from "./tape";

const IN = 203_200;

describe("measureBetween()", () => {
  it('reads 36" left to right', () => {
    expect(measureBetween([0, 0, 0], [36 * IN, 0, 0], "imperial")).toEqual({
      leftRight: 36 * IN,
      frontBack: 0,
      upDown: 0,
      straight: 36 * IN,
    });
  });

  it("reads a 3-4-5 triangle's long side as exactly 5\"", () => {
    expect(measureBetween([0, 0, 0], [3 * IN, 4 * IN, 0], "imperial").straight).toBe(5 * IN);
  });

  it('snaps a straight distance between grid lines to the nearest 1/64"', () => {
    // √(1² + 1²)" = 1.41421…" = 90.51/64" → 91/64" = 288925 units.
    expect(measureBetween([0, 0, 0], [IN, IN, 0], "imperial").straight).toBe(91 * 3175);
  });

  it("gives distances, never negative", () => {
    expect(measureBetween([10 * IN, 0, 0], [0, 0, 0], "imperial").leftRight).toBe(10 * IN);
  });

  it("reads all three directions at once", () => {
    const r = measureBetween([0, 0, 0], [IN, -2 * IN, 2 * IN], "imperial");
    expect([r.leftRight, r.frontBack, r.upDown, r.straight]).toEqual([IN, 2 * IN, 2 * IN, 3 * IN]);
  });

  it("reads a metric 3-4-5 triangle exactly", () => {
    // Sides of 300,000 and 400,000 units make a 3-4-5 triangle: the straight line is 500,000.
    expect(measureBetween([0, 0, 0], [300_000, 400_000, 0], "metric").straight).toBe(500_000);
  });

  it("rounds a straight line half way between two metric grid lines to the even one", () => {
    // The metric grid is 0.01 mm = 80 units. A line along one axis reads its own length, so 40
    // units is half way between 0 and 80 (steps 0 and 1: even is 0), 120 between 80 and 160
    // (steps 1 and 2: even is 2 → 160) and 200 between 160 and 240 (steps 2 and 3: even is 2 → 160).
    const straight = (units: number) => measureBetween([0, 0, 0], [units, 0, 0], "metric").straight;
    expect([straight(40), straight(120), straight(200)]).toEqual([0, 160, 160]);
  });
});

describe("tapeTool", () => {
  const started = () => {
    const store = createKerfStore({ storage: createStorage(memoryStorage()) });
    store.getState().begin(startProject("Bookcase", "imperial"));
    store.getState().setTool("tape");
    return store;
  };
  const click = (point: [number, number, number] | null): ModelPointer => ({
    kind: "down",
    hit: point && {
      placed: {} as PlacedPart,
      point,
      normal: [0, 0, 1],
    },
    ray: point ? null : { origin: [40, 10, 4], dir: [0, -1, 0] },
    shift: false,
    ctrl: false,
  });

  it("measures between two clicks and leaves nothing half done", () => {
    const s = started();
    tapeTool.pointer?.(click([0, 0, 0]), s);
    expect(s.getState().pending).toEqual({ tool: "tape", from: [0, 0, 0] });
    tapeTool.pointer?.(click([36 * IN, 0, 0]), s);
    expect(s.getState().tape).toEqual({ from: [0, 0, 0], to: [36 * IN, 0, 0] });
    expect(s.getState().pending).toBeNull();
  });

  it("takes a click on the floor from the line of sight", () => {
    const s = started();
    tapeTool.pointer?.(click(null), s);
    expect(s.getState().pending).toEqual({ tool: "tape", from: [40 * IN, -4 * IN, 0] });
  });

  it("clears the last reading when a new measurement begins", () => {
    const s = started();
    tapeTool.pointer?.(click([0, 0, 0]), s);
    tapeTool.pointer?.(click([IN, 0, 0]), s);
    tapeTool.pointer?.(click([2 * IN, 0, 0]), s);
    expect(s.getState().tape).toBeNull();
  });

  it("ignores a click on the sky", () => {
    const s = started();
    tapeTool.pointer?.({ ...click(null), ray: { origin: [0, 10, 0], dir: [0, 1, 0] } }, s);
    expect(s.getState().pending).toBeNull();
  });

  it("ignores moves and releases", () => {
    const s = started();
    tapeTool.pointer?.({ ...click([0, 0, 0]), kind: "move" }, s);
    expect(s.getState().pending).toBeNull();
  });

  it("asks for the first point, then the second", () => {
    const s = started();
    expect(tapeTool.prompt?.(s.getState())).toBe("Click the first point");
    tapeTool.pointer?.(click([0, 0, 0]), s);
    expect(tapeTool.prompt?.(s.getState())).toBe("Click the second point");
  });
});
