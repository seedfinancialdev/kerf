// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { isMilestoneActive } from "../../src/index";

describe("milestones.json", () => {
  it("has a boolean entry for each of M1-M5", () => {
    for (const id of ["M1", "M2", "M3", "M4", "M5"] as const) {
      expect(typeof isMilestoneActive(id)).toBe("boolean");
    }
  });
});
