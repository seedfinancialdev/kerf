// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A step's tip says what the step's hint line says, so the two never drift apart; a tool's tip
// promises only what the tool does.

import { describe, expect, it } from "vitest";
import { hintFor, STEPS } from "../model/steps";
import { stepTip, TIPS } from "./tips";

describe("stepTip", () => {
  it.each(STEPS)("%s says what its hint line says", (step) => {
    // The hint reads "Name — what it is for." (model/steps.ts); the tip keeps the second half.
    const forWhat = hintFor(step, "box").split(" — ")[1] ?? "";
    expect(stepTip(step, "box").text.toLowerCase()).toBe(forWhat.toLowerCase());
  });

  it("starts Joinery's tip with a capital, as the spec words it", () => {
    expect(stepTip("Joinery", undefined).text).toBe(
      "Check the joints your tools can cut, then accept them.",
    );
  });

  it("follows the kind of project", () => {
    expect(stepTip("Shape", "box").text).toContain("how the box is built");
    expect(stepTip("Shape", "case").text).toContain("how the case is built");
  });
});

describe("TIPS.edge", () => {
  // ADR 016, D7 and known limit 6: the engine draws roundovers only; chamfer is shown as Later.
  it("promises only what Edge profile can do: round over", () => {
    expect(TIPS.edge.text).toBe("Round over the edges of a board.");
  });
});
