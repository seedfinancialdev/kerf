// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Joinery step's list (Interaction spec, "4. Joinery from your shop"): each joint in shop
// words, its cut sizes, and whether the user's tools can make it, or what they would need.

import { formatLength, type Id, type JointCut, type JointSummary, type Project } from "@kerf/core";
import type { ToolTopic } from "./shop-record";

/**
 * One line of the Joinery step: a joint, in shop words, with its cut sizes and whether the shop can
 * cut it.
 */
export interface JoineryRow {
  joint: Id;
  /** Unique among the rows: the joint plus the kind and size of this cut. */
  key: string;
  /** "Shelf in dados in Right side". */
  text: string;
  /** Cut sizes: `23/32" wide, 1/4" deep`, or the number of dovetail corners. */
  detail: string;
  /** True when the shop has no tool that can make this cut. */
  missing: boolean;
  /** What the shop can do about it, as a sentence. */
  shop: string;
  /**
   * The tool the cut is made with, or the one it needs: what to ask about when the shop was never told
   * (ADR 016, D4). The engine names a dado stack for a cut nothing in the shop can make.
   */
  topic: ToolTopic;
}

const KIND = {
  dado: "dados",
  groove: "grooves",
  rabbet: "rabbets",
  dovetail: "dovetails",
} as const;

function shopSentence(cut: JointCut, units: Project["units"]): string {
  if (cut.kind === "dovetail") {
    return cut.missing ? "You'd need hand tools for dovetails." : "Cut by hand.";
  }
  if (cut.missing) {
    return `You'd need a dado stack, or a router with a straight bit no wider than ${formatLength(cut.width, units)}.`;
  }
  return cut.tool === "dadoStack"
    ? "Your dado stack cuts this."
    : "Your router cuts this, in more than one pass if the bit is narrower.";
}

/**
 * One row per kind and size of cut in each joint. A joint that failed has no cuts and so no row;
 * its reason is in the problems list.
 */
export function joineryRows(joints: JointSummary[], units: Project["units"]): JoineryRow[] {
  return joints.flatMap((j) =>
    j.cuts.map((cut) => ({
      joint: j.joint,
      key: `${j.joint}|${cut.kind}|${cut.width}|${cut.depth}`,
      text: `${j.guest} in ${KIND[cut.kind]} in ${j.host}`,
      detail:
        cut.kind === "dovetail"
          ? `${j.pairs} corner${j.pairs === 1 ? "" : "s"}`
          : `${formatLength(cut.width, units)} wide, ${formatLength(cut.depth, units)} deep`,
      missing: cut.missing,
      shop: shopSentence(cut, units),
      topic: cut.tool,
    })),
  );
}
