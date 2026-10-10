// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

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
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const q = (n: number): number => (n * INCH) / 64;
const sixtyFourths = (len: number): number => (len * 64) / INCH;
const issues = (p: Project) => solve(p, shop).diagnostics;

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

  // Lowering the bottom moves its groove toward the outside of the box; a board is warned once the
  // groove leaves the half-pin. The warned boards (by instance name) at each height are exact.
  const warnedAt = (z: string): string[] => {
    const lowered: Project = {
      ...tall,
      instances: tall.instances.map((i) =>
        i.name === "Bottom" ? { ...i, position: { ...i.position, z } } : i,
      ),
    };
    const names = issues(lowered)
      .filter((d) => d.rule === "groove-outside-bottom-half-pin")
      .map((d) => (d.field ?? "?").replace(/ groove$/, ""));
    return [...new Set(names)].sort();
  };

  it("warns for exactly the boards whose groove leaves the half-pin", () => {
    expect(warnedAt("0in")).toEqual([]);
    expect(warnedAt("3/64in")).toEqual(["Side A", "Side B"]);
    expect(warnedAt("4/64in")).toEqual(["Back", "Front", "Side A", "Side B"]);
  });
});

describe("keeps the golden numbers", () => {
  it("still produces the bookcase's three cut-list lines", () => {
    expect(solve(loadProject("bookcase"), shop).cutList.lines).toHaveLength(3);
    expect(q(1)).toBe(INCH / 64);
  });
});
