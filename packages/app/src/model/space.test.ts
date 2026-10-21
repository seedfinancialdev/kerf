// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D6: the piece is the space less a gap at each side and one at the top; depth as typed.

import { INCH, MM } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { outsideFromSpace } from "./space";

describe("outsideFromSpace()", () => {
  it('takes 1/8" off each side and the top of a 30-1/2" × 80" alcove', () => {
    // width 30-1/2" − 2 × 1/8" = 30-1/4" = 6_146_800; height 80" − 1/8" = 79-7/8" = 16_230_600
    const r = outsideFromSpace({ w: 6_197_600, h: 80 * INCH, d: 12 * INCH }, INCH / 8);
    expect(r).toEqual({ ok: true, size: { w: 6_146_800, h: 16_230_600, d: 2_438_400 } });
  });

  it("works in millimetres: 900 × 2000 with a 3 mm gap is 894 × 1997", () => {
    const r = outsideFromSpace({ w: 900 * MM, h: 2000 * MM, d: 300 * MM }, 3 * MM);
    expect(r).toEqual({ ok: true, size: { w: 894 * MM, h: 1997 * MM, d: 300 * MM } });
  });

  it("allows no gap", () => {
    expect(outsideFromSpace({ w: INCH, h: INCH, d: INCH }, 0)).toEqual({
      ok: true,
      size: { w: INCH, h: INCH, d: INCH },
    });
  });

  it("refuses a gap that leaves nothing, in plain words", () => {
    // 1/4" wide with 1/8" each side leaves 0
    expect(outsideFromSpace({ w: INCH / 4, h: INCH, d: INCH }, INCH / 8)).toEqual({
      ok: false,
      message: "The gap is bigger than the space.",
    });
  });

  it("refuses a negative gap", () => {
    expect(outsideFromSpace({ w: INCH, h: INCH, d: INCH }, -1)).toEqual({
      ok: false,
      message: "The gap can't be less than zero.",
    });
  });
});
