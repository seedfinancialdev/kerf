// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "3D tools" table: keys Space, B (also R), P, M, J, F, T; "E is deliberately
// unassigned (SketchUp's eraser)".

import { describe, expect, it } from "vitest";
import { TOOLS, toolForKey } from "./tools";

describe("tools", () => {
  it("lists the seven tools with their keys, in the spec's order", () => {
    expect(TOOLS.map((t) => `${t.label} ${t.key}`)).toEqual([
      "Select Space",
      "Board B",
      "Push/Pull P",
      "Move M",
      "Join J",
      "Edge profile F",
      "Tape T",
    ]);
  });

  it("maps B and R to Board", () => {
    expect(toolForKey("b")).toBe("board");
    expect(toolForKey("R")).toBe("board");
  });

  it("leaves E unassigned", () => {
    expect(toolForKey("e")).toBeUndefined();
  });

  it("maps Space to Select", () => {
    expect(toolForKey(" ")).toBe("select");
  });
});
