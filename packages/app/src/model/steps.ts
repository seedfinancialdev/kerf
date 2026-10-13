// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The five workflow steps (Interaction spec, "Workflow modules") and the one-line hint each shows
// under the top bar (design spec, "Layout").

import type { Structure } from "@kerf/core";

/** The five steps of the flow, in order (Interaction spec, "The flow"). */
export const STEPS = ["Start", "Shape", "Divide", "Joinery", "Build plan"] as const;
/** One of the five steps. */
export type Step = (typeof STEPS)[number];

/** What the step is for, in one sentence. */
export function hintFor(step: Step, type: Structure["type"] | undefined): string {
  const piece = type === "box" ? "box" : "case";
  switch (step) {
    case "Start":
      return "Start — pick a template and set the overall size.";
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
