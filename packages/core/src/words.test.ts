// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Shop language": the engine's keys never reach the screen (code review I2:
// "end0 face1" and "throughDovetail" were shown as they are).

import { describe, expect, it } from "vitest";
import type { EdgeRef, Joint } from "./types";
import { edgeName, JOINT_NAME, JOINT_WORD } from "./words";

const EDGES: EdgeRef[] = ["end0", "end1", "edge0", "edge1"].flatMap((side) =>
  ["face0", "face1"].map((face) => `${side}/${face}` as EdgeRef),
);
const JOINTS: Joint["type"][] = ["dado", "rabbet", "throughDovetail"];
/** Plain words: letters, spaces and commas, no key-like camelCase, digits or slashes. */
const PLAIN = /^[A-Za-z][a-z ,]*$/;

describe("shop words", () => {
  it("names every edge plainly, show face and inside face apart", () => {
    expect(edgeName("edge1/face1")).toBe("Front edge, show face");
    expect(edgeName("end0/face0")).toBe("First end, inside face");
    for (const edge of EDGES) expect(edgeName(edge)).toMatch(PLAIN);
    expect(new Set(EDGES.map(edgeName)).size).toBe(8);
  });

  it("names every joint plainly, on its own and in a sentence", () => {
    expect(JOINT_NAME.throughDovetail).toBe("through dovetail");
    expect(JOINT_WORD.throughDovetail).toBe("through dovetails");
    for (const type of JOINTS) {
      expect(JOINT_NAME[type]).toMatch(PLAIN);
      expect(JOINT_WORD[type]).toMatch(PLAIN);
    }
  });
});
