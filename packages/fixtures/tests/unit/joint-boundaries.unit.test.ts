// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import {
  INCH,
  type Project,
  type RemovalPrimitive,
  type ShopProfile,
  solve,
  solveModel,
} from "@kerf/core";
import { deriveJoints } from "@kerf/core/internal";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const inch = (n: number): number => n * INCH;
const rules = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const hostCuts = (p: Project, name = "Host"): RemovalPrimitive[] => {
  const m = solveModel(p);
  const d = deriveJoints(p, m);
  const id = m.instances.find((i) => i.name === name)?.id ?? "";
  return d.instances.get(id)?.cuts ?? [];
};
const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const hostAt: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "0in"] };
const rabbetP = (
  params: Record<string, string>,
  at: [string, string, string] = ["2in", "0in", "3/4in"],
  g: PartSpec = guest,
  orientation = 16,
): Project =>
  boards(
    [host, g],
    [hostAt, { name: "Guest", part: "Guest", at, orientation }],
    [{ type: "rabbet", host: "Host", guest: "Guest", params }],
  );
const dadoP = (params: Record<string, string>, at: [string, string, string]): Project =>
  boards(
    [host, guest],
    [hostAt, { name: "Guest", part: "Guest", at, orientation: 17 }],
    [{ type: "dado", host: "Host", guest: "Guest", params }],
  );

describe("joints", () => {
  it("a zero rabbet width is invalid-parameter, not 'not seated'", () => {
    const r = rules(rabbetP({ width: "0in" }));
    expect(r).toContain("error:invalid-parameter");
    expect(r).not.toContain("error:rabbet-not-seated");
  });
  it("a zero rabbet depth is invalid-parameter", () => {
    expect(rules(rabbetP({ depth: "0in" }))).toContain("error:invalid-parameter");
  });
  it("an edge1 rabbet is cut from y = W - width (5-1/2in to 6in), 3/8in deep on the top", () => {
    const cuts = hostCuts(rabbetP({}, ["2in", "5.5in", "3/4in"]));
    expect(cuts).toEqual([
      { kind: "box", min: [0, inch(5.5), inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
  });
  // Guests whose thickness runs along the host's length (orientation 17) meet the ends.
  const standing = (params: Record<string, string>, x: string): Project =>
    rabbetP(params, [x, "0in", "3/4in"], guest, 17);

  it("an end0 rabbet: the guest against the end, or against the shoulder of a wider step", () => {
    expect(rules(standing({}, "0in"))).toEqual([]);
    expect(hostCuts(standing({}, "0in"))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(1 / 2), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "1/4in"))).toEqual([]);
    expect(hostCuts(standing({ width: "3/4in" }, "1/4in"))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(3 / 4), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "0in"))).toContain("error:rabbet-not-seated");
  });

  it("an end1 rabbet: the guest against the end, or against the shoulder of a wider step", () => {
    expect(rules(standing({}, "11.5in"))).toEqual([]);
    expect(rules(standing({ width: "3/4in" }, "11.25in"))).toEqual([]);
    expect(hostCuts(standing({ width: "3/4in" }, "11.25in"))).toEqual([
      { kind: "box", min: [inch(11.25), 0, inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
    expect(rules(standing({ width: "3/4in" }, "11.5in"))).toContain("error:rabbet-not-seated");
  });

  it("an edge1 rabbet wider than the guest is cut from the shoulder the guest stands against", () => {
    expect(rules(rabbetP({ width: "3/4in" }, ["2in", "5.25in", "3/4in"]))).toEqual([]);
    expect(hostCuts(rabbetP({ width: "3/4in" }, ["2in", "5.25in", "3/4in"]))).toEqual([
      { kind: "box", min: [0, inch(5.25), inch(3 / 8)], max: [inch(12), inch(6), inch(3 / 4)] },
    ]);
  });

  it("a guest hanging off the edge of the host is not seated in the rabbet", () => {
    // 5" along y from y = -4" to 1": only the last 1" is over the host, but the guest is not in the
    // step.
    const p = rabbetP({ width: "1in" }, ["2in", "-4in", "3/4in"], guest, 17);
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });

  it("a guest hanging past the far end of the host is not seated in an end1 rabbet", () => {
    // 1/2" thick from x = 11-3/4" to 12-1/4": only 1/4" is over the host.
    expect(rules(standing({ width: "1in" }, "11.75in"))).toContain("error:rabbet-not-seated");
  });

  it("a rabbet narrower than the guest says so", () => {
    const found = solve(rabbetP({ width: "1/4in" }), shop).diagnostics.find(
      (d) => d.rule === "rabbet-not-seated",
    );
    expect(found).toMatchObject({ severity: "error", field: "Host rabbet" });
  });

  it("a rabbet exactly half the host's width, with the guest against its shoulder, is built", () => {
    expect(rules(rabbetP({ width: "3in" }, ["2in", "2.5in", "3/4in"]))).toEqual([]);
    expect(hostCuts(rabbetP({ width: "3in" }, ["2in", "2.5in", "3/4in"]))).toEqual([
      { kind: "box", min: [0, 0, inch(3 / 8)], max: [inch(12), inch(3), inch(3 / 4)] },
    ]);
  });

  it("a board standing mid-board across the full width is not seated in a rabbet", () => {
    const wide: PartSpec = { ...guest, width: "6in" };
    const p = boards(
      [host, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 17 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });
  it("a guest lying flat is not seated even when its length equals its thickness", () => {
    const stub: PartSpec = { ...guest, length: "1/2in" };
    const p = boards(
      [host, stub],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "0in", "3/4in"], orientation: 0 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("error:rabbet-not-seated");
  });
  it("a dado ending exactly at the board's end is allowed: x 11-1/2in to 12in", () => {
    const p = dadoP({}, ["11.5in", "1/2in", "3/4in"]);
    expect(rules(p)).toEqual([]);
    expect(hostCuts(p)).toEqual([
      { kind: "box", min: [inch(11.5), 0, inch(0.5)], max: [inch(12), inch(6), inch(0.75)] },
    ]);
  });
  it("the error for a guest against the end of a board names end1", () => {
    const p = dadoP({}, ["12in", "1/2in", "0in"]); // orientation 17 guest touching x = 12
    const d = solve(p, shop).diagnostics.find((x) => x.rule === "dado-needs-face");
    expect(d?.message).toContain("end1");
  });
  it("the error for a guest against the edge of a board names edge1", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "6in", "0in"], orientation: 0 }],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
    const d = solve(p, shop).diagnostics.find((x) => x.rule === "dado-needs-face");
    expect(d?.message).toContain("edge1");
  });
  it("a stop as long as the whole dado is an error", () => {
    expect(rules(dadoP({ stop: "6in" }, ["2in", "1/2in", "3/4in"]))).toContain("error:dado-stop");
  });
  it("a stop of zero is an error", () => {
    expect(rules(dadoP({ stop: "0in" }, ["2in", "1/2in", "3/4in"]))).toContain("error:dado-stop");
  });
  it("dados of half the thickness on opposite faces, one above the other, do not overlap", () => {
    const h: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "4in"] };
    const p = boards(
      [host, guest, { ...guest, name: "Guest2" }],
      [
        h,
        { name: "Guest", part: "Guest", at: ["2in", "1/2in", "4.75in"], orientation: 17 },
        { name: "G2", part: "Guest2", at: ["2in", "1/2in", "0in"], orientation: 17 },
      ],
      [
        { type: "dado", host: "Host", guest: "Guest", params: { depth: "3/8in" } },
        { type: "dado", host: "Host", guest: "G2", params: { depth: "3/8in" } },
      ],
    );
    expect(rules(p)).toEqual([]);
  });
  it("one overlapping pair of dados has no count", () => {
    const p = boards(
      [host, guest, { ...guest, name: "Guest2" }],
      [
        hostAt,
        { name: "Guest", part: "Guest", at: ["2in", "1/2in", "3/4in"], orientation: 17 },
        { name: "G2", part: "Guest2", at: ["2.25in", "1/2in", "3/4in"], orientation: 17 },
      ],
      [
        { type: "dado", host: "Host", guest: "Guest" },
        { type: "dado", host: "Host", guest: "G2" },
      ],
    );
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "dado-overlap");
    expect(d).toHaveLength(1);
    expect(d[0]?.count).toBeUndefined();
  });
  it("one guest touching nothing is reported once, without a count", () => {
    const p = dadoP({}, ["2in", "1/2in", "30in"]);
    const d = solve(p, shop).diagnostics.filter((x) => x.rule === "joint-no-contact");
    expect(d).toHaveLength(1);
    expect(d[0]?.count).toBeUndefined();
    // The joint is named in shop words, not by its key (code review I2: "throughDovetail").
    expect(d[0]?.message).toBe("Guest does not meet Host for a dado, so there is nothing to join.");
    // It names the guest it is about by instance, so an editor can tell one board's joint error
    // from another's of the same row (second-pass re-review, minor 2).
    expect(d[0]?.instances).toEqual([p.instances.find((i) => i.name === "Guest")?.id]);
  });
  it("a dado error names the guest and the host it lies between, by instance", () => {
    // The guest stands 2" in on a 5" run along a 6" host width, so its end runs past the face.
    const p = dadoP({}, ["2in", "2in", "3/4in"]);
    const d = solve(p, shop).diagnostics.find((x) => x.rule === "dado-outside-face");
    const id = (name: string) => p.instances.find((i) => i.name === name)?.id;
    expect(d?.instances).toEqual([id("Guest"), id("Host")]);
  });
  it("guests of a pattern that overlap the host are reported as one aggregate, not per pair", () => {
    const p = boards(
      [host, guest],
      [hostAt, { name: "Guest", part: "Guest", at: ["2in", "1/2in", "0in"], orientation: 17 }],
      [{ type: "dado", host: "Host", guest: "Guest" }],
      {
        patterns: [
          { source: "Guest", count: "3", axis: "x", spacing: { mode: "fixed", step: "3in" } },
        ],
      },
    );
    const r = rules(p);
    expect(r).not.toContain("error:joint-overlap");
  });
  it("a conflicting roundover on a part used twice is reported once", () => {
    const part: PartSpec = {
      ...host,
      name: "Top",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
        {
          id: "01K7M3Q8ZD00000000F3000A02",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/4in",
        },
      ],
    };
    const p = boards(
      [part],
      [
        { name: "A", part: "Top", at: ["0in", "0in", "0in"] },
        { name: "B", part: "Top", at: ["0in", "10in", "0in"] },
      ],
    );
    expect(solve(p, shop).diagnostics.filter((d) => d.rule === "roundover-conflict")).toHaveLength(
      1,
    );
  });
  it("two radii on one edge are a roundover-conflict; [O10] and no cut is derived", () => {
    const part: PartSpec = {
      ...host,
      name: "Top",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
        {
          id: "01K7M3Q8ZD00000000F3000A02",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/4in",
        },
      ],
    };
    const p = boards([part], [{ name: "Top", part: "Top", at: ["0in", "0in", "0in"] }]);
    expect(rules(p)).toContain("error:roundover-conflict");
    expect(hostCuts(p, "Top")).toEqual([]);
  });
  const topWith = (edges: string[], radius: string, w = "20in"): Project => {
    const part: PartSpec = {
      name: "Top",
      length: "30in",
      width: w,
      thickness: "3/4in",
      ops: [{ id: "01K7M3Q8ZD00000000F3000A01", type: "roundover", edges: edges as never, radius }],
    };
    return boards([part], [{ name: "Top", part: "Top", at: ["0in", "0in", "0in"] }]);
  };
  it("radii on opposite edges of opposite faces do not compete", () => {
    expect(rules(topWith(["edge0/face0", "edge1/face1"], "1/2in"))).toEqual([]);
  });
  it("the two ends of one face compete like the two edges", () => {
    expect(rules(topWith(["end0/face1", "end1/face1"], "1/2in"))).toContain(
      "error:roundover-radii-too-large",
    );
  });
  it("a radius equal to the width of a narrow strip is allowed", () => {
    expect(rules(topWith(["edge0/face1"], "1/2in", "1/2in"))).toEqual([]);
  });
});
