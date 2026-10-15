// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A step's tip says what the step's hint line says, so the two never drift apart.

import { describe, expect, it } from "vitest";
import { hintFor, STEPS } from "../model/steps";
import { TIPS } from "./tips";

describe("TIPS for the steps", () => {
  it.each(STEPS)("%s says what its hint line says", (step) => {
    // The hint reads "Name — what it is for." (model/steps.ts); the tip keeps the second half.
    const forWhat = hintFor(step, undefined).split(" — ")[1] ?? "";
    expect(TIPS[step].text.toLowerCase()).toBe(forWhat.toLowerCase());
  });

  it("starts Joinery's tip with a capital, as the spec words it", () => {
    expect(TIPS.Joinery.text).toBe("Check the joints your tools can cut, then accept them.");
  });
});
