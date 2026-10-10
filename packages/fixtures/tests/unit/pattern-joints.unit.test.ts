// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { deriveJointCuts, type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

{
  const shop = loadShopProfile();
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
  function manyCorners(n: number): Project {
    const pinsAt: InstanceSpec = {
      name: "Pins",
      part: "Pins",
      at: ["0in", "0in", "0in"],
      orientation: 1,
    };
    const tailsAt: InstanceSpec = {
      name: "Tails",
      part: "Tails",
      at: ["0in", "0in", "0in"],
      orientation: 12,
    };
    return boards(
      [pins, tails],
      [pinsAt, tailsAt],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
      {
        patterns: [
          { source: "Pins", count: String(n), axis: "y", spacing: { mode: "fixed", step: "10in" } },
          {
            source: "Tails",
            count: String(n),
            axis: "y",
            spacing: { mode: "fixed", step: "10in" },
          },
        ],
      },
    );
  }
  function withStep(p: Project, source: string, step: string): Project {
    const id = p.instances.find((i) => i.name === source)?.id;
    return {
      ...p,
      patterns: p.patterns.map((x) =>
        x.source === id ? { ...x, spacing: { mode: "fixed", step } } : x,
      ),
    };
  }

  describe("pattern-to-pattern joints", () => {
    it("reports one aggregated message for guests that touch nothing, not one per pair", () => {
      const p = manyCorners(40);
      const unmatched = withStep(p, "Tails", "11in"); // half the guests drift away from their hosts
      const found = solve(unmatched, shop).diagnostics.filter((d) => d.rule === "joint-no-contact");
      expect(found.length).toBeLessThanOrEqual(1);
    });
  });

  describe("diagnostic floods", () => {
    it("bounds dado-overlap errors and stays fast with many dados on one host", () => {
      const host: PartSpec = { name: "Host", length: "12in", width: "40in", thickness: "3/4in" };
      const guest: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/16in" };
      const p = boards(
        [host, guest],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "G", part: "G", at: ["2in", "0in", "3/4in"], orientation: 16 },
        ],
        [{ type: "dado", host: "Host", guest: "G", params: { fit: "1/8in" } }],
        {
          patterns: [
            { source: "G", count: "300", axis: "y", spacing: { mode: "fixed", step: "1/8in" } },
          ],
        },
      );
      const started = performance.now();
      const result = solve(p, shop);
      expect(performance.now() - started).toBeLessThan(5000);
      expect(result.diagnostics.length).toBeLessThan(200);
    });

    it("reports a failing dado once per joint (one for each side), not once per shelf", () => {
      const bookcase = withParam(loadProject("bookcase"), "dado_depth", "1in");
      const found = solve(bookcase, shop).diagnostics.filter((d) => d.rule === "dado-too-deep");
      expect(found).toHaveLength(2); // the right and the left side each have one dado joint
      for (const d of found) expect(d.count).toBe(4); // four shelves each
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);
  const ply = (name: string, l: string, w: string, extra: Partial<PartSpec> = {}): PartSpec => ({
    name,
    length: l,
    width: w,
    thickness: "3/4in",
    ...extra,
  });

  describe("overlaps are not hidden by a joint that did not join the parts", () => {
    it("reports a shelf that passes through a second side the dado never touched", () => {
      // Two sides 10" apart (a pattern); the shelf is seated against the first and runs on through
      // the second. The dado joins it to the first side only.
      const side = ply("Side", "20in", "6in");
      const shelf = ply("Shelf", "20in", "6in");
      const p = boards(
        [side, shelf],
        [
          { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
          { name: "Shelf", part: "Shelf", at: ["3/4in", "0in", "5in"] },
        ],
        [{ type: "dado", host: "Side", guest: "Shelf" }],
        {
          patterns: [
            { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
          ],
        },
      );
      expect(rules(p)).toContain("error:overlap");
    });
  });

  describe("pattern joints say what is wrong, and count it once", () => {
    const manyDividers = (n: number, params: Record<string, string>): Project => {
      const host: PartSpec = { name: "Host", length: "60in", width: "12in", thickness: "3/4in" };
      const div: PartSpec = { name: "Div", length: "4in", width: "10in", thickness: "1/2in" };
      return boards(
        [host, div],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Div", part: "Div", at: ["2in", "1in", "3/4in"], orientation: 17 },
        ],
        [{ type: "dado", host: "Host", guest: "Div", params }],
        {
          patterns: [
            { source: "Div", count: String(n), axis: "x", spacing: { mode: "fixed", step: "2in" } },
          ],
        },
      );
    };

    it("counts every failing guest exactly once, with no false 'does not touch'", () => {
      const result = solve(manyDividers(8, { depth: "3/4in" }), shop);
      const tooDeep = result.diagnostics.filter((d) => d.rule === "dado-too-deep");
      expect(tooDeep.reduce((sum, d) => sum + (d.count ?? 1), 0)).toBe(8);
      expect(result.diagnostics.map((d) => d.rule)).not.toContain("joint-no-contact");
    });

    it("names an interpenetrating pattern guest as an overlap, not as 'does not touch'", () => {
      const p = manyDividers(3, {});
      const sunk: Project = {
        ...p,
        instances: p.instances.map((i) =>
          i.name === "Div" ? { ...i, position: { ...i.position, z: "1/2in" } } : i,
        ),
      };
      const found = rules(sunk);
      expect(found).not.toContain("error:joint-no-contact");
      expect(found.some((r) => r === "error:joint-overlap" || r === "error:overlap")).toBe(true);
    });
  });

  describe("third review: joints that quietly do the wrong thing", () => {
    it("two rabbet joints on one pair are an error, not a doubled cut size", () => {
      const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
      const back: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
      const joint = { type: "rabbet" as const, host: "Host", guest: "Back" };
      const p = boards(
        [host, back],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Back", part: "Back", at: ["2in", "0in", "3/4in"], orientation: 16 },
        ],
        [joint, joint],
      );
      const result = solve(p, shop);
      expect(result.diagnostics.map((d) => d.rule)).toContain("duplicate-joint");
      expect(result.blocked).toBe(true);
    });

    it("warns when a copy of a patterned host is joined to nothing", () => {
      const p = boards(
        [ply("Side", "20in", "6in"), ply("Shelf", "8in", "6in")],
        [
          { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
          { name: "Shelf", part: "Shelf", at: ["3/4in", "0in", "5in"] },
        ],
        [{ type: "dado", host: "Side", guest: "Shelf" }],
        {
          patterns: [
            { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
          ],
        },
      );
      expect(rules(p)).toContain("warning:joint-host-unjoined");
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);

  describe("duplicate joint", () => {
    const h: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const b: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
    const inst: InstanceSpec[] = [
      { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
      { name: "Back", part: "Back", at: ["2in", "0in", "3/4in"], orientation: 16 },
    ];
    const j = { type: "rabbet" as const, host: "Host", guest: "Back" };
    it("control: one rabbet is clean", () => expect(rules(boards([h, b], inst, [j]))).toEqual([]));
    it("three rabbets: each repeat is reported (two diagnostics)", () => {
      const d = solve(boards([h, b], inst, [j, j, j]), shop).diagnostics.filter(
        (x) => x.rule === "duplicate-joint",
      );
      expect(d).toHaveLength(2);
    });
    it("a repeated rabbet is not cut twice in the derived guest size", () => {
      const one = boards([h, b], inst, [j]);
      const two = boards([h, b], inst, [j, j]);
      const add = (p: Project, i: number) => deriveJointCuts(p, p.joints[i]?.id ?? "").guestCutAdd;
      expect(add(two, 0)).toEqual(add(one, 0));
      expect(add(two, 1)).toEqual({ length: 0, width: 0 });
    });
  });

  describe("joint-host-unjoined", () => {
    const side: PartSpec = { name: "Side", length: "20in", width: "6in", thickness: "3/4in" };
    const shelf: PartSpec = { name: "Shelf", length: "8in", width: "6in", thickness: "3/4in" };
    const mk = (shelfX: string, shelfCount?: string): Project =>
      boards(
        [side, shelf],
        [
          { name: "Side", part: "Side", at: ["0in", "0in", "0in"], orientation: 17 },
          { name: "Shelf", part: "Shelf", at: [shelfX, "0in", "5in"] },
        ],
        [{ type: "dado", host: "Side", guest: "Shelf" }],
        {
          patterns: [
            { source: "Side", count: "2", axis: "x", spacing: { mode: "fixed", step: "10in" } },
            ...(shelfCount
              ? [
                  {
                    source: "Shelf",
                    count: shelfCount,
                    axis: "x" as const,
                    spacing: { mode: "fixed" as const, step: "10in" },
                  },
                ]
              : []),
          ],
        },
      );
    it("no warning when every copy has a shelf", () =>
      expect(rules(mk("3/4in", "2"))).not.toContain("warning:joint-host-unjoined"));
    it("no warning (only no-contact) when no copy has a shelf", () => {
      const r = rules(mk("40in"));
      expect(r).toContain("error:joint-no-contact");
      expect(r).not.toContain("warning:joint-host-unjoined");
    });
    it("carries count when several copies are bare", () => {
      const p = mk("3/4in");
      const q = { ...p, patterns: p.patterns.map((x) => ({ ...x, count: "4" })) };
      const d = solve(q, shop).diagnostics.find((x) => x.rule === "joint-host-unjoined");
      expect(d?.count).toBe(3);
    });
  });
}
