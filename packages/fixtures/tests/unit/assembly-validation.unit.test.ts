// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const rules = (p: Project, s: ShopProfile = shop) =>
  solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const hostAt: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "0in"] };
const ply = (name: string, l: string, w: string, extra: Partial<PartSpec> = {}): PartSpec => ({
  name,
  length: l,
  width: w,
  thickness: "3/4in",
  ...extra,
});

describe("validate", () => {
  const tall = withParam(loadProject("box"), "box_height", "4in + 1/64in");
  const withBottomZ = (z: string): Project => ({
    ...tall,
    instances: tall.instances.map((i) =>
      i.name === "Bottom" ? { ...i, position: { ...i.position, z } } : i,
    ),
  });
  const warned = (z: string): string[] =>
    solve(withBottomZ(z), shop)
      .diagnostics.filter((d) => d.rule === "groove-outside-bottom-half-pin")
      .map((d) => (d.field ?? "").replace(" groove", ""))
      .sort();
  // Hand calculation (Operation specs, keepsake box): W = 4-1/64", 3 tails of 1/4" pins -> the bottom
  // half-pin is 16/64 + 1/64 = 17/64". The groove is 1/4" wide, 1/4" deep in 1/2" stock and the
  // tails' slope offset is 1/16" (1:8 over 1/2"). Allowed far edge of the groove from the bottom
  // edge: 17/64 + (1/16 x shallowest depth 1/4") / (1/2") = 17/64 + 2/64 = 19/64". The groove's far
  // edge is z + 1/4" = z + 16/64, so a groove with its bottom at z <= 3/64 is inside, 4/64 is not.
  it("a groove exactly on the limit (z = 3/64) does not warn for Front and Back", () => {
    expect(warned("3/64in")).toEqual(["Side A", "Side B"]);
  });
  it("one grid step higher (z = 4/64) Front and Back warn too", () => {
    expect(warned("4/64in")).toEqual(["Back", "Front", "Side A", "Side B"]);
  });
  it("a groove at the very bottom warns nobody", () => {
    expect(warned("0in")).toEqual([]);
  });
  it("each board is warned once, with no count", () => {
    const d = solve(withBottomZ("4/64in"), shop).diagnostics.filter(
      (x) => x.rule === "groove-outside-bottom-half-pin",
    );
    expect(d).toHaveLength(4);
    for (const x of d) expect(x.count).toBeUndefined();
  });
  it("exactly 10 overlapping pairs name all ten; 15 pairs name ten and count fifteen", () => {
    const blocks = (n: number): Project =>
      boards(
        [ply("P", "4in", "4in")],
        Array.from({ length: n }, (_, i) => ({
          name: `P${i}`,
          part: "P",
          at: ["0in", "0in", "0in"] as [string, string, string],
        })),
      );
    const five = solve(blocks(5), shop).diagnostics.filter((d) => d.rule === "overlap");
    expect(five).toHaveLength(10);
    expect(five.every((d) => d.count === undefined)).toBe(true);
    const six = solve(blocks(6), shop).diagnostics.filter((d) => d.rule === "overlap");
    expect(six).toHaveLength(11);
    expect(six.filter((d) => d.count !== undefined).map((d) => d.count)).toEqual([15]);
  });
  it("a roundover on the TOP edge that a joint covers is reported hidden", () => {
    const top: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/8in",
        },
      ],
    };
    const wide: PartSpec = { ...guest, width: "12in" };
    const p = boards(
      [top, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "0in", "3/4in"], orientation: 16 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("warning:roundover-hidden");
    // The edge is named as the Edge tool names it, not by its key "edge0/face1" (code review I2).
    expect(solve(p, shop).diagnostics.find((d) => d.rule === "roundover-hidden")?.message).toBe(
      "The roundover on Host (Back edge, show face) is hidden by a joint.",
    );
  });
  it("roundovers on end1 and edge1 are found hidden where a joint covers them", () => {
    const end: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["end1/face1"],
          radius: "1/8in",
        },
      ],
    };
    const wide: PartSpec = { ...guest, width: "6in" };
    const p = boards(
      [end, wide],
      [hostAt, { name: "Guest", part: "Guest", at: ["11.5in", "0in", "3/4in"], orientation: 17 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p)).toContain("warning:roundover-hidden");
    const edge1: PartSpec = {
      ...host,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge1/face1"],
          radius: "1/8in",
        },
      ],
    };
    const long: PartSpec = { ...guest, width: "12in" };
    const p2 = boards(
      [edge1, long],
      [hostAt, { name: "Guest", part: "Guest", at: ["0in", "5.5in", "3/4in"], orientation: 16 }],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(rules(p2)).toContain("warning:roundover-hidden");
  });
  it("a roundover on a dovetailed board does not crash the solve", () => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000A01",
          type: "roundover",
          edges: ["edge0/face1"],
          radius: "1/16in",
        },
      ],
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
      [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
    );
    expect(rules(p)).not.toContain("error:internal-error");
  });
});
