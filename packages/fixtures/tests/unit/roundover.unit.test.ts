// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type Project, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const issues = (p: Project) => solve(p, shop).diagnostics;
const rules = (p: Project) => issues(p).map((d) => `${d.severity}:${d.rule}`);

describe("roundover radius rules", () => {
  const top = (edges: string[], radius: string): Project => {
    const part: PartSpec = {
      name: "Top",
      length: "30in",
      width: "20in",
      thickness: "3/4in",
      ops: [{ id: "01K7M3Q8ZD00000000F3000A01", type: "roundover", edges: edges as never, radius }],
    };
    return boards([part], [{ name: "Top", part: "Top", at: ["0in", "0in", "0in"] }]);
  };
  const fourTopEdges = ["edge0/face1", "edge1/face1", "end0/face1", "end1/face1"];

  it('allows an ordinary tabletop: 1/4" on all four top edges of a 3/4" board', () => {
    expect(rules(top(fourTopEdges, "1/4in"))).toEqual([]);
  });

  it("rejects two opposite edges of one face that together exceed the thickness", () => {
    expect(rules(top(["edge0/face1", "edge1/face1"], "1/2in"))).toContain(
      "error:roundover-radii-too-large",
    );
  });

  it("rejects both faces of one edge that together exceed the thickness, allows exactly the thickness", () => {
    expect(rules(top(["edge1/face0", "edge1/face1"], "1/2in"))).toContain(
      "error:roundover-radii-too-large",
    );
    expect(rules(top(["edge1/face0", "edge1/face1"], "3/8in"))).toEqual([]);
  });

  it("allows a radius equal to the thickness; rejects one beyond the width of a narrow strip", () => {
    expect(rules(top(["edge1/face1"], "3/4in"))).toEqual([]);
    const strip: PartSpec = {
      name: "Strip",
      length: "12in",
      width: "1/2in",
      thickness: "3/4in",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A02",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "5/8in",
        },
      ],
    };
    expect(
      rules(boards([strip], [{ name: "Strip", part: "Strip", at: ["0in", "0in", "0in"] }])),
    ).toContain("error:roundover-too-large");
  });

  it("counts a repeated edge once", () => {
    const p = top(["edge1/face1", "edge1/face1"], "1/8in");
    expect(solve(p, shop).setups.at(-1)?.cuts).toBe(1);
  });
});
