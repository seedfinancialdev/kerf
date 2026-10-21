// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The four workflow steps (Interaction spec, "Workflow modules") and the one-line hint each shows
// under the top bar (design spec, "Layout"). Start left the steps in M4.5: its jobs moved to New
// project, Home and Your shop (ADR 016).

import type { Structure } from "@kerf/core";

/** The four steps of the flow, in order (Interaction spec, "The workflow"). */
export const STEPS = ["Shape", "Divide", "Joinery", "Build plan"] as const;
/** One of the four steps. */
export type Step = (typeof STEPS)[number];

/** What the step is for, in one sentence. */
export function hintFor(step: Step, type: Structure["type"] | undefined): string {
  const piece = type === "box" ? "box" : "case";
  switch (step) {
    case "Shape":
      return `Shape — choose how the ${piece} is built. Every board follows the form until you edit it by hand.`;
    case "Divide":
      return "Divide — click an opening, then add shelves, a partition or bays.";
    case "Joinery":
      return "Joinery — check the joints your tools can cut, then accept them.";
    case "Build plan":
      return "Build plan — what to buy, what to cut, and in what order.";
  }
}
