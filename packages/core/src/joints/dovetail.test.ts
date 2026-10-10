// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { INCH } from "../units";
import { layoutDovetail } from "./dovetail";

const q = (n: number): number => (n * INCH) / 64;

describe("layoutDovetail", () => {
  it("keeps every position an integer even for inputs that are not on the grid", () => {
    // 1 unit off the 1/64" grid: the sub-step leftover goes to edge0 instead of becoming a fraction.
    const layout = layoutDovetail({
      boardWidth: q(256) + 1,
      tails: 3,
      pin: q(16),
      matingThickness: q(32),
      slope: 8,
    });
    if ("problem" in layout) throw new Error("expected a layout");
    for (const n of [...layout.halfPins, ...layout.tails.flatMap((t) => [t.start, t.end])]) {
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(layout.halfPins[0] + layout.halfPins[1] + 3 * layout.wideTailWidth + 2 * q(16)).toBe(
      q(256) + 1,
    );
  });

  it('refuses a slope outside 1:5 to 1:10, a pin under 1/8", and no room', () => {
    const base = { boardWidth: q(256), tails: 3, pin: q(16), matingThickness: q(32), slope: 8 };
    expect(layoutDovetail({ ...base, slope: 11 })).toEqual({ problem: "slope" });
    expect(layoutDovetail({ ...base, slope: 4 })).toEqual({ problem: "slope" });
    expect(layoutDovetail({ ...base, pin: q(7) })).toEqual({ problem: "thin-pin" });
    expect(layoutDovetail({ ...base, tails: 20 })).toEqual({ problem: "no-room" });
  });
});
