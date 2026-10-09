// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { INCH, MM } from "./units";

describe("unit constants (domain model decision 1)", () => {
  it("1 inch = 203,200 units and 1 mm = 8,000 units", () => {
    expect(INCH).toBe(203200);
    expect(MM).toBe(8000);
  });

  it("1/64 inch (3,175) and 0.01 mm (80) are exact", () => {
    expect(INCH % 64).toBe(0);
    expect(INCH / 64).toBe(3175);
    expect(MM % 100).toBe(0);
    expect(MM / 100).toBe(80);
  });
});
