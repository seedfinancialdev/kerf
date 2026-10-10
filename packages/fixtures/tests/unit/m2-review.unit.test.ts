// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Defects found by the M2 independent reviews, each written to fail first. Every expected value is
// a hand calculation from the spec, in 1/64ths of an inch unless a case says otherwise.

import {
  deriveJoints,
  type Frame,
  INCH,
  type Project,
  type RemovalPrimitive,
  solve,
  solveModel,
  toParent,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const q = (n: number): number => (n * INCH) / 64;
const sixtyFourths = (len: number): number => (len * 64) / INCH;
const issues = (p: Project) => solve(p, shop).diagnostics;
const rules = (p: Project) => issues(p).map((d) => `${d.severity}:${d.rule}`);

describe("dovetails line up when the pin board's width axis points the other way", () => {
  // The reference box: Back (orientation 3) has its width running downward; the sides run upward.
  // 4" + 1/64" leaves one grid step over, which goes to edge0 of the tail board.
  const tall = withParam(loadProject("box"), "box_height", "4in + 1/64in");

  function spans(name: string, project: Project) {
    const model = solveModel(project);
    const derived = deriveJoints(project, model);
    const frame = (n: string): Frame => {
      const instance = model.instances.find((i) => i.name === n);
      const part = model.parts.find((p) => p.id === instance?.def);
      if (!instance || !part) throw new Error(`no ${n}`);
      return { instance, part };
    };
    const zOf = (f: Frame, local: [number, number, number]): number => toParent(f, local)[2];

    // Tails of the guest, as parent-frame Z ranges: the material between the spaces.
    const guestSpans = (guest: string, host: string): Array<[number, number]> => {
      const pair = derived.pairs.find(
        (p) =>
          p.kind === "throughDovetail" &&
          p.guest === frame(guest).instance.id &&
          p.host === frame(host).instance.id,
      );
      if (!pair) throw new Error("no pair");
      const f = frame(guest);
      const gaps = pair.guestCuts
        .filter(
          (c): c is Extract<RemovalPrimitive, { kind: "trapezoidPrism" }> =>
            c.kind === "trapezoidPrism",
        )
        .map((c) => {
          const tip = c.points.slice(0, 2).map(([x, y]) => zOf(f, [x as number, y as number, 0]));
          return [Math.min(...tip), Math.max(...tip)] as [number, number];
        })
        .sort((a, b) => a[0] - b[0]);
      const out: Array<[number, number]> = [];
      for (let i = 0; i + 1 < gaps.length; i += 1)
        out.push([(gaps[i] as [number, number])[1], (gaps[i + 1] as [number, number])[0]]);
      return out;
    };
    // Sockets of the host, as parent-frame Z ranges at the tip.
    const hostSpans = (host: string, guest: string): Array<[number, number]> => {
      const pair = derived.pairs.find(
        (p) =>
          p.kind === "throughDovetail" &&
          p.host === frame(host).instance.id &&
          p.guest === frame(guest).instance.id,
      );
      if (!pair) throw new Error("no pair");
      const f = frame(host);
      return pair.hostCuts
        .filter(
          (c): c is Extract<RemovalPrimitive, { kind: "trapezoidPrism" }> =>
            c.kind === "trapezoidPrism",
        )
        .map((c) => {
          const pts = c.points
            .slice(0, 2)
            .map(([y, z]) => zOf(f, [c.range[0], y as number, z as number]));
          return [Math.min(...pts), Math.max(...pts)] as [number, number];
        })
        .sort((a, b) => a[0] - b[0]);
    };
    return { guestSpans: guestSpans("Side A", name), hostSpans: hostSpans(name, "Side A") };
  }

  it.each(["Front", "Back"])("every tail of Side A meets its socket in %s", (host) => {
    const { guestSpans, hostSpans } = spans(host, tall);
    expect(hostSpans).toHaveLength(3);
    expect(hostSpans).toEqual(guestSpans);
  });

  it("puts the leftover step at the bottom edge, the same on every board", () => {
    // Hand calculation: W = 4-1/64" = 257/64", n = 3, p = 16/64: room = 257 - 64 = 193, wide =
    // floor(193/3) = 64, leftover 1 step -> edge0 (bottom), so the first tail starts at 17/64.
    const { guestSpans } = spans("Front", tall);
    expect(guestSpans.map(([a, b]) => [sixtyFourths(a), sixtyFourths(b)])).toEqual([
      [17, 81],
      [97, 161],
      [177, 241],
    ]);
  });

  it("warns identically for Front and Back, which have the same groove at the same height", () => {
    const lowered: Project = {
      ...tall,
      instances: tall.instances.map((i) =>
        i.name === "Bottom" ? { ...i, position: { ...i.position, z: "3/64in" } } : i,
      ),
    };
    const warned = new Set(
      issues(lowered)
        .filter((d) => d.rule === "groove-outside-bottom-half-pin")
        .map((d) => lowered.parts.find((p) => p.id === d.part)?.name),
    );
    expect(warned.has("Front")).toBe(warned.has("Back"));
  });
});

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

describe("rabbet placement and seating", () => {
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  const seated: InstanceSpec = {
    name: "Guest",
    part: "Guest",
    at: ["2in", "0in", "3/4in"],
    orientation: 16,
  };
  const rabbet = (params: Record<string, string>): Project =>
    boards(
      [host, guest],
      [{ name: "Host", part: "Host", at: ["0in", "0in", "0in"] }, seated],
      [{ type: "rabbet", host: "Host", guest: "Guest", params }],
    );

  it("rabbet-not-seated: a width wider or narrower than the guest's thickness", () => {
    expect(rules(rabbet({ width: "1in" }))).toContain("error:rabbet-not-seated");
    expect(rules(rabbet({ width: "1/4in" }))).toContain("error:rabbet-not-seated");
    expect(rules(rabbet({ width: "1/2in" }))).toEqual([]);
  });

  it("honours `at`, and rejects one that disagrees with where the guest sits", () => {
    expect(rules(rabbet({ at: "edge0" }))).toEqual([]);
    expect(rules(rabbet({ at: "end1" }))).toContain("error:rabbet-not-seated");
    expect(rules(rabbet({ face: "face1" }))).toEqual([]); // the guest stands on the top face
    expect(rules(rabbet({ face: "face0" }))).toContain("error:rabbet-not-seated");
  });
});

describe("joint parameters must make physical sense", () => {
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  const dado = (params: Record<string, string>): Project =>
    boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at: ["2in", "2in", "3/4in"], orientation: 16 },
      ],
      [{ type: "dado", host: "Host", guest: "Guest", params }],
    );

  it.each([
    ["a dado fit below zero", dado({ fit: "-1in" })],
    ["a dado depth of zero", dado({ depth: "0in" })],
    [
      "a rabbet width of zero",
      boards(
        [host, guest],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 16 },
        ],
        [{ type: "rabbet", host: "Host", guest: "Guest", params: { width: "0in" } }],
      ),
    ],
  ])("%s is an error on its field", (_label, project) => {
    const found = issues(project).find((d) => d.severity === "error" && d.joint !== undefined);
    expect(found).toBeDefined();
    expect(found?.field).toBeDefined();
  });

  it("a negative `proud` on a dovetail is an error and never shortens a board", () => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const tails: PartSpec = {
      name: "Tails",
      length: "6in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const p = boards(
      [pins, tails],
      [
        { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
        { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
      ],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails", params: { proud: "-1in" } }],
    );
    expect(rules(p)).toContain("error:invalid-parameter");
  });
});

describe("keeps the golden numbers", () => {
  it("still produces the bookcase's three cut-list lines", () => {
    expect(solve(loadProject("bookcase"), shop).cutList.lines).toHaveLength(3);
    expect(q(1)).toBe(INCH / 64);
  });
});
