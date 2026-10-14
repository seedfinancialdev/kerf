// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The shop words for the engine's own keys (Interaction spec, "Shop language"). Diagnostics are
// shown to the user as they are written, so they name an edge or a joint the way a woodworker
// does, never by its key ("edge1/face1", "throughDovetail"); the app uses the same words in its
// panels, so a board's edge reads the same in a problem and in the Edge tool.

import type { EdgeRef, Joint } from "./types";

const EDGE_NAMES: Record<EdgeRef, string> = {
  "edge1/face1": "Front edge, show face",
  "edge1/face0": "Front edge, inside face",
  "edge0/face1": "Back edge, show face",
  "edge0/face0": "Back edge, inside face",
  "end0/face1": "First end, show face",
  "end0/face0": "First end, inside face",
  "end1/face1": "Second end, show face",
  "end1/face0": "Second end, inside face",
};

/** An edge in shop words: "edge1/face1" → "Front edge, show face". */
export function edgeName(edge: EdgeRef): string {
  return EDGE_NAMES[edge];
}

/** Each type of joint named on its own: "dado", "rabbet", "through dovetail". */
export const JOINT_NAME: Readonly<Record<Joint["type"], string>> = {
  dado: "dado",
  rabbet: "rabbet",
  throughDovetail: "through dovetail",
};

/** The settings a joint's parameters may carry (Domain model, Joint "params"; Operation specs). */
export type JointParam = "depth" | "fit" | "stop" | "width" | "pin" | "proud" | "tails";

const PARAM_NAMES: Record<JointParam, string> = {
  depth: "depth",
  fit: "fit allowance",
  stop: "stop",
  width: "width",
  pin: "pin width",
  proud: "proud amount",
  tails: "number of tails",
};

/** A joint setting, to start a sentence: "The pin width of the through dovetail". */
export function jointSetting(type: Joint["type"], param: JointParam): string {
  return `The ${PARAM_NAMES[param]} of the ${JOINT_NAME[type]}`;
}

/** How each type of joint reads in a sentence: "a dado", "a rabbet", "through dovetails". */
export const JOINT_WORD: Readonly<Record<Joint["type"], string>> = {
  dado: "a dado",
  rabbet: "a rabbet",
  throughDovetail: "through dovetails",
};
