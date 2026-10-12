// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Scale and limit tests: hostile or huge input must be bounded, reported, and finish. They are
// correct in a few hundred milliseconds each but sit outside the 100 ms unit budget, so they run
// as their own medium-tier project (`pnpm test:stress`).

import { type Project, solve } from "@kerf/core";
import { buildDisplayMesh, initGeometry, isManifold, MAX_REMOVALS } from "@kerf/geometry";
import { KerfFormatError, readKerf } from "@kerf/io";
import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { boards, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const slab = (name: string, side = "4in"): PartSpec => ({
  name,
  length: side,
  width: side,
  thickness: "1/2in",
});
const fixed = (source: string, count: number, step: string) => ({
  source,
  count: String(count),
  axis: "x" as const,
  spacing: { mode: "fixed" as const, step },
});

describe("joints between large patterns", () => {
  const stacked = (count: number, side: string): Project =>
    boards(
      [slab("Slab", side), slab("G", side)],
      [
        { name: "Slab", part: "Slab", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["0in", "0in", "0in"] },
      ],
      [{ type: "dado", host: "Slab", guest: "G" }],
      { patterns: [fixed("Slab", count, "1/64in"), fixed("G", count, "1/64in")] },
    );

  it("works out exactly 100,000 pairs (250 x 400) and refuses one more guest (250 x 401)", () => {
    const pair = (hosts: number, guests: number): Project =>
      boards(
        [slab("Slab", "20in"), slab("G", "20in")],
        [
          { name: "Slab", part: "Slab", at: ["0in", "0in", "0in"] },
          { name: "G", part: "G", at: ["0in", "0in", "0in"] },
        ],
        [{ type: "dado", host: "Slab", guest: "G" }],
        { patterns: [fixed("Slab", hosts, "1/64in"), fixed("G", guests, "1/64in")] },
      );
    const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => d.rule);
    expect(rules(pair(250, 400))).not.toContain("joint-too-many-pairs");
    expect(rules(pair(250, 401))).toContain("joint-too-many-pairs");
  });

  it("works out 316 x 316 = 99,856 pairs and refuses 317 x 317 = 100,489, once", () => {
    const ok = solve(stacked(316, "20in"), shop).diagnostics.map((d) => d.rule);
    expect(ok).not.toContain("joint-too-many-pairs");
    const refused = solve(stacked(317, "20in"), shop).diagnostics.filter(
      (d) => d.rule === "joint-too-many-pairs",
    );
    expect(refused.map((d) => [d.severity, d.field])).toEqual([["error", "dado between patterns"]]);
  });

  it("does not derive millions of pairs between overlapping pattern members", () => {
    const host: PartSpec = { name: "Host", length: "96in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = { name: "G", length: "4in", width: "5in", thickness: "1/2in" };
    const p = boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "G", part: "G", at: ["2in", "0.5in", "3/4in"], orientation: 17 },
      ],
      [{ type: "dado", host: "Host", guest: "G" }],
      { patterns: [fixed("Host", 2500, "1/32in"), fixed("G", 2500, "1/32in")] },
    );
    const result = solve(p, shop);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.length).toBeLessThan(100);
  });
});

describe("piles of parts", () => {
  it("bounds overlap errors when thousands of parts collapse onto one spot", () => {
    const p = boards([slab("P")], [{ name: "P", part: "P", at: ["0in", "0in", "0in"] }], [], {
      patterns: [
        { source: "P", count: "2000", axis: "z", spacing: { mode: "fixed", step: "1/1000in" } },
      ],
    });
    const result = solve(p, shop);
    expect(result.diagnostics.length).toBeLessThan(200);
    // The first few pairs are named, and the total is still told.
    const counts = result.diagnostics.filter((d) => d.rule === "overlap").map((d) => d.count ?? 1);
    expect(Math.max(...counts)).toBeGreaterThan(1000);
  });

  it("says so once when more than a million pairs overlap", () => {
    const p = boards(
      [slab("Slab")],
      [{ name: "Slab", part: "Slab", at: ["0in", "0in", "0in"] }],
      [],
      {
        patterns: [fixed("Slab", 5000, "1/64in")],
      },
    );
    const found = solve(p, shop).diagnostics.filter((d) => d.rule === "overlap");
    // Ten pairs are named (each carries its part); the cap adds one summary that names no part.
    expect(found.every((d) => d.severity === "error")).toBe(true);
    expect(found.filter((d) => d.part === undefined && d.count === undefined)).toHaveLength(1);
  });
});

describe("display meshes", () => {
  beforeAll(async () => {
    await initGeometry();
  });
  const blank = { length: 12 * 203_200, width: 6 * 203_200, thickness: (203_200 * 3) / 4 };
  const box = (min: [number, number, number], max: [number, number, number]) =>
    ({ kind: "box", min, max }) as const;

  it("builds repeatedly without leaking: 200 builds of a part with 50 cuts", () => {
    const cuts = Array.from({ length: 50 }, (_, i) =>
      box([i * 25_400, 0, 0], [i * 25_400 + 12_700, 6 * 203_200, 50_800]),
    );
    for (let i = 0; i < 200; i += 1) buildDisplayMesh(blank, cuts);
    expect(isManifold(buildDisplayMesh(blank, cuts))).toBe(true);
  });

  it("draws exactly MAX_REMOVALS cuts", () => {
    const cuts = Array.from({ length: MAX_REMOVALS }, (_, i) =>
      box(
        [(i % 100) * 20_000, Math.floor(i / 100) * 20_000, 0],
        [(i % 100) * 20_000 + 10_000, Math.floor(i / 100) * 20_000 + 10_000, 50_800],
      ),
    );
    expect(() => buildDisplayMesh(blank, cuts)).not.toThrow();
  });
});

describe(".kerf archives", () => {
  it("limits how large an entry may expand to (zip bomb guard)", () => {
    const meta = JSON.stringify({
      schemaVersion: 1,
      appVersion: "0.0.0",
      created: "2026-10-09T00:00:00.000Z",
      modified: "2026-10-09T00:00:00.000Z",
    });
    const bomb = zipSync({
      "project.json": new Uint8Array(40 * 1024 * 1024).fill(32),
      "meta.json": strToU8(meta),
    });
    let caught: unknown;
    try {
      readKerf(bomb);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(KerfFormatError);
    expect((caught as Error).message).toMatch(/too large/);
  });
});
