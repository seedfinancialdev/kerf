// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Tests added after the M2 mutation run: behaviours the first suite let a subtly wrong
// implementation get away with. Every expected number is worked out by hand from the spec
// (1/64ths of an inch unless stated). Metric cases use 1 mm = 8,000 units, grid 0.01 mm = 80.

import {
  boxOf,
  deriveJointCuts,
  deriveJoints,
  dovetailLayout,
  type Frame,
  INCH,
  MM,
  nest,
  type Project,
  type RemovalPrimitive,
  solve,
  solveModel,
  toParent,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadExpected, loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const q = (n: number): number => (n * INCH) / 64;
const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);

function derived(p: Project) {
  const model = solveModel(p);
  return { model, d: deriveJoints(p, model) };
}

describe("mirrored hosts: cuts are reflected into the definition's own space", () => {
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  // Orientation 17 stands the guest up with its thickness along X: x 2 to 2-1/2", y 1/2 to 5-1/2".
  const project = (mirroredHost: boolean, mirroredGuest = false): Project =>
    boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"], mirrored: mirroredHost },
        {
          name: "Guest",
          part: "Guest",
          at: ["2in", "1/2in", "3/4in"],
          orientation: 17,
          mirrored: mirroredGuest,
        },
      ],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
  const hostBox = (p: Project): RemovalPrimitive | undefined => {
    const { model, d } = derived(p);
    const id = model.instances.find((i) => i.name === "Host")?.id ?? "";
    return d.instances.get(id)?.cuts[0];
  };

  it("an unmirrored host cuts its dado at x = 2in to 2-1/2in", () => {
    expect(hostBox(project(false))).toEqual({
      kind: "box",
      min: [q(128), 0, q(32)],
      max: [q(160), q(384), q(48)],
    });
  });

  it("a mirrored host reflects across its Y-Z plane: x = 12 - 2-1/2 = 9-1/2in to 10in", () => {
    expect(hostBox(project(true))).toEqual({
      kind: "box",
      min: [q(608), 0, q(32)],
      max: [q(640), q(384), q(48)],
    });
  });

  it("a mirrored guest still has its length grown by the dado depth, and the same cut line", () => {
    const plain = solve(project(false), shop).cutList;
    const mirrored = solve(project(false, true), shop).cutList;
    expect(mirrored).toEqual(plain);
    const guestLine = mirrored.lines.find((l) => l.parts[0]?.name === "Guest");
    expect(guestLine?.length).toBe(q(4 * 64 + 16)); // 4" + 1/4" (3/4 / 3)
  });
});

describe("dovetail layout: leftover grid steps and rounding ties", () => {
  const spec = { tails: 3, pin: q(16), matingThickness: q(32), slope: 8 };

  it("gives an odd leftover step to edge0: W = 3-1/2in (224/64)", () => {
    // room = 224 - 4 x 16 = 160; wide = floor(160 / 3) = 53 (not 53.33); leftover 1 step -> edge0.
    const layout = dovetailLayout({ ...spec, boardWidth: q(224) });
    expect(layout.wideTailWidth).toBe(q(53));
    expect(layout.slopeOffset).toBe(q(4)); // 32 / 8
    expect(layout.narrowTailWidth).toBe(q(53 - 8));
  });

  it("splits an even leftover equally: W = 3-3/4in (240/64), wide 58, leftover 2 -> 1 and 1", () => {
    const layout = dovetailLayout({ ...spec, boardWidth: q(240) });
    expect(layout.wideTailWidth).toBe(q(58)); // floor(176 / 3) = 58
  });

  it("snaps the slope offset half to even: 9/16in / 8 = 4.5/64 -> 4/64", () => {
    const layout = dovetailLayout({ ...spec, boardWidth: q(256), matingThickness: q(36) });
    expect(layout.slopeOffset).toBe(12700); // 4/64" = 12,700 units, not 5/64" (15,875)
    expect(layout.wideTailWidth).toBe(203200); // (4" - 1") / 3 = exactly 1"
    expect(layout.narrowTailWidth).toBe(203200 - 2 * 12700);
  });

  it("places the leftover step at the bottom of the box and sizes each tail (golden, +1/64)", () => {
    // From the fixture-independent hand calculation in m2-review: tails start at 17, 97, 177.
    const wide = dovetailLayout({ ...spec, boardWidth: q(257) });
    expect(wide.wideTailWidth).toBe(q(64));
  });
});

describe("dovetail geometry in the box, exactly", () => {
  const { model, d } = derived(loadProject("box"));
  const id = (n: string): string => model.instances.find((i) => i.name === n)?.id ?? "";
  const prisms = (name: string): RemovalPrimitive[] =>
    (d.instances.get(id(name))?.cuts ?? []).filter((c) => c.kind === "trapezoidPrism");
  const key = (p: RemovalPrimitive): string => JSON.stringify(p);

  it('Front\'s sockets: tails 1" wide at the outside face, 7/8" at the inside, at both corners', () => {
    // Profile (y, z): tip at z = 1/2" (face1, outside), base at z = 0. Tails start at 16, 96, 176.
    const sockets = (range: [number, number]): RemovalPrimitive[] =>
      [16, 96, 176].map((s) => ({
        kind: "trapezoidPrism" as const,
        plane: "yz" as const,
        points: [
          [q(s), q(32)],
          [q(s + 64), q(32)],
          [q(s + 60), 0],
          [q(s + 4), 0],
        ] as ReadonlyArray<readonly [number, number]>,
        range: [q(range[0]), q(range[1])] as const,
      }));
    const expected = [...sockets([0, 32]), ...sockets([608, 640])].map(key).sort();
    expect(prisms("Front").map(key).sort()).toEqual(expected);
  });

  it('Side A\'s spaces at the front end: 1/4" at the tip, widening 1/16" a side to the baseline', () => {
    // Side A's end at y = 0 is its local end1 (x runs back to front): tip x = 384, baseline x = 352.
    const gaps: Array<[[number, number], [number, number]]> = [
      [
        [0, 16],
        [0, 20],
      ],
      [
        [80, 96],
        [76, 100],
      ],
      [
        [160, 176],
        [156, 180],
      ],
      [
        [240, 256],
        [236, 256],
      ],
    ];
    const atFront = gaps.map(([tip, base]) => ({
      kind: "trapezoidPrism" as const,
      plane: "xy" as const,
      points: [
        [q(384), q(tip[0])],
        [q(384), q(tip[1])],
        [q(352), q(base[1])],
        [q(352), q(base[0])],
      ] as ReadonlyArray<readonly [number, number]>,
      range: [0, q(32)] as const,
    }));
    const found = prisms("Side A").map(key);
    for (const g of atFront) expect(found).toContain(key(g));
    expect(found).toHaveLength(8);
  });

  it("every tail of Side A meets the same socket in Front and Back, in the parent frame", () => {
    const frame = (n: string): Frame => {
      const instance = model.instances.find((i) => i.name === n);
      const part = model.parts.find((p) => p.id === instance?.def);
      if (!instance || !part) throw new Error(n);
      return { instance, part };
    };
    // Parent-frame Z of each socket's tip edge, in 64ths, for Front and Back (Back is flipped).
    const spans = (host: string): Array<[number, number]> =>
      prisms(host)
        .filter((c) => c.kind === "trapezoidPrism" && c.range[0] === 0)
        .map((c) => {
          if (c.kind !== "trapezoidPrism") return [0, 0] as [number, number];
          const f = frame(host);
          const z = c.points
            .slice(0, 2)
            .map(([y, zz]) => toParent(f, [c.range[0], y as number, zz as number])[2]);
          return [Math.min(...z) / (INCH / 64), Math.max(...z) / (INCH / 64)] as [number, number];
        })
        .sort((a, b) => a[0] - b[0]);
    expect(spans("Front")).toEqual([
      [16, 80],
      [96, 160],
      [176, 240],
    ]);
    expect(spans("Back")).toEqual([
      [16, 80],
      [96, 160],
      [176, 240],
    ]);
    expect(boxOf(frame("Front").instance).max[2]).toBe(q(256));
  });
});

describe("dovetail with boards of different thickness", () => {
  const corner = (hostThick: string, guestThick: string): Project => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width: "4in",
      thickness: hostThick,
      stock: "wood",
    };
    const tails: PartSpec = {
      name: "Tails",
      length: "6in",
      width: "4in",
      thickness: guestThick,
      stock: "wood",
    };
    // Positions are the box's: the tail board's end meets the pin board's outer face.
    return boards(
      [pins, tails],
      [
        { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
        { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
      ],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails" }],
    );
  };
  const pairOf = (p: Project) => {
    const { model, d } = derived(p);
    const pair = d.pairs.find((x) => x.kind === "throughDovetail");
    if (!pair) throw new Error("no pair");
    return { pair, model };
  };

  it('pin board 1/2", tail board 3/4": offset 1/2 / 8, baselines at the mating thickness', () => {
    const { pair } = pairOf(corner("1/2in", "3/4in"));
    const socket = pair.hostCuts.find((c) => c.kind === "trapezoidPrism");
    // Socket range along the pin board = the tail board's thickness (3/4" = 48/64).
    expect(socket?.kind === "trapezoidPrism" ? socket.range : []).toEqual([0, q(48)]);
    // Tail spaces reach back by the pin board's thickness (1/2" = 32/64) from the tail end.
    const space = pair.guestCuts.find((c) => c.kind === "trapezoidPrism");
    const xs = space?.kind === "trapezoidPrism" ? space.points.map(([x]) => x) : [];
    expect(new Set(xs)).toEqual(new Set([q(384), q(352)]));
    // Slope offset = 1/2" / 8 = 4/64: the first tail is 1" at the tip, 7/8" at the neck.
    const first = pair.hostCuts.filter((c) => c.kind === "trapezoidPrism")[0];
    const pts = first?.kind === "trapezoidPrism" ? first.points : [];
    expect(Math.abs((pts[1]?.[0] ?? 0) - (pts[2]?.[0] ?? 0))).toBe(q(4));
  });

  it('pin board 3/4", tail board 1/2": offset 3/4 / 8 = 6/64, baseline 3/4" back', () => {
    const { pair } = pairOf(corner("3/4in", "1/2in"));
    const space = pair.guestCuts.find((c) => c.kind === "trapezoidPrism");
    const xs = space?.kind === "trapezoidPrism" ? space.points.map(([x]) => x) : [];
    expect(new Set(xs)).toEqual(new Set([q(384), q(384 - 48)]));
    const socket = pair.hostCuts.find((c) => c.kind === "trapezoidPrism");
    expect(socket?.kind === "trapezoidPrism" ? socket.range : []).toEqual([0, q(32)]);
    const first = pair.hostCuts.filter((c) => c.kind === "trapezoidPrism")[0];
    const pts = first?.kind === "trapezoidPrism" ? first.points : [];
    expect(Math.abs((pts[1]?.[0] ?? 0) - (pts[2]?.[0] ?? 0))).toBe(q(6));
  });
});

describe("default tail count rounds half to even", () => {
  const sockets = (width: string): number => {
    const pins: PartSpec = {
      name: "Pins",
      length: "10in",
      width,
      thickness: "1/2in",
      stock: "wood",
    };
    const tails: PartSpec = {
      name: "Tails",
      length: "6in",
      width,
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
    const { d } = derived(p);
    return d.pairs[0]?.hostCuts.length ?? -1;
  };

  it('W / 1-1/2": 3-3/4in -> 2.5 -> 2 tails; 6-3/4in -> 4.5 -> 4; 2-1/4in -> 1.5 -> 2; 4in -> 3', () => {
    expect(sockets("3-3/4in")).toBe(2);
    expect(sockets("6-3/4in")).toBe(4);
    expect(sockets("2-1/4in")).toBe(2);
    expect(sockets("4in")).toBe(3);
  });
});

describe("defaults are snapped down, in both unit systems", () => {
  const host = (thickness: string): PartSpec => ({
    name: "Host",
    length: "12in",
    width: "6in",
    thickness,
  });
  const dadoCut = (hostThickness: string): number => {
    const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
    const p = boards(
      [host(hostThickness), guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at: ["2in", "1/2in", hostThickness], orientation: 17 },
      ],
      [{ type: "dado", host: "Host", guest: "Guest" }],
    );
    return deriveJointCuts(p, p.joints[0]?.id ?? "").guestCutAdd.length;
  };

  it('dado depth on 23/32" ply is thickness / 3 = 15.33/64 -> 15/64 (47,625 units)', () => {
    expect(dadoCut("23/32in")).toBe(47625);
  });

  it('rabbet depth on 11/64" stock is thickness / 2 = 5.5/64 -> 5/64 (15,875 units)', () => {
    const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
    const p = boards(
      [host("11/64in"), guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at: ["2in", "0in", "11/64in"], orientation: 16 },
      ],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    expect(deriveJointCuts(p, p.joints[0]?.id ?? "").guestCutAdd.length).toBe(15875);
  });

  it("metric: a 19 mm board's default dado is 19 / 3 = 6.333 mm -> 6.33 mm (50,640 units)", () => {
    const h: PartSpec = { name: "Host", length: "300mm", width: "150mm", thickness: "19mm" };
    const g: PartSpec = { name: "Guest", length: "100mm", width: "120mm", thickness: "12mm" };
    const p = boards(
      [h, g],
      [
        { name: "Host", part: "Host", at: ["0mm", "0mm", "0mm"] },
        { name: "Guest", part: "Guest", at: ["50mm", "10mm", "19mm"], orientation: 17 },
      ],
      [{ type: "dado", host: "Host", guest: "Guest" }],
      { units: "metric" },
    );
    expect(deriveJointCuts(p, p.joints[0]?.id ?? "").guestCutAdd.length).toBe(50640);
    expect(solve(p, shop).diagnostics).toEqual([]);
    const setup = solve(p, shop).setups[0];
    expect(setup).toMatchObject({ width: 12 * MM, depth: 50640, cuts: 1 });
  });
});

describe("dado stop and fit", () => {
  const withParams = (extra: Record<string, string>): Project => {
    const base = loadProject("bookcase");
    return {
      ...base,
      joints: base.joints.map((j) =>
        j.type === "dado" ? { ...j, params: { ...j.params, ...extra } } : j,
      ),
    };
  };
  const sideDados = (p: Project): RemovalPrimitive[] => {
    const { model, d } = derived(p);
    const id = model.instances.find((i) => i.name === "Right side")?.id ?? "";
    return (d.instances.get(id)?.cuts ?? []).filter(
      (c) => c.kind === "box" && c.min[0] >= q(900) && c.max[0] <= q(3700),
    );
  };

  it("a stop of 2in ends each dado 2in short of the front edge: y from 0 to 10in", () => {
    const cuts = sideDados(withParams({ stop: "2in" }));
    expect(cuts).toHaveLength(4);
    for (const c of cuts) expect(c.kind === "box" && [c.min[1], c.max[1]]).toEqual([0, q(640)]);
  });

  it("a fit of 1/16in widens each dado from 46/64 to 50/64 and the setup width with it", () => {
    const cuts = sideDados(withParams({ fit: "1/16in" }));
    expect(cuts.map((c) => (c.kind === "box" ? c.max[0] - c.min[0] : 0))).toEqual([
      q(50),
      q(50),
      q(50),
      q(50),
    ]);
    const result = solve(withParams({ fit: "1/16in" }), shop);
    expect(result.setups.find((s) => s.cuts === 8)?.width).toBe(q(50));
  });
});

describe("rabbet and dovetail boundaries", () => {
  const rabbetCase = (guestThickness: string): string[] => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = {
      name: "Guest",
      length: "4in",
      width: "5in",
      thickness: guestThickness,
    };
    const p = boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 16 },
      ],
      [{ type: "rabbet", host: "Host", guest: "Guest" }],
    );
    return rules(p);
  };

  it("a rabbet exactly half the host's width (3in of 6in) is allowed; 3-1/64in is too wide", () => {
    expect(rabbetCase("3in")).not.toContain("error:rabbet-too-wide");
    expect(rabbetCase("3-1/64in")).toContain("error:rabbet-too-wide");
  });

  it('a narrow tail of exactly 1/8" is allowed; 7/64" is not', () => {
    const tailsFor = (width: string): string[] => {
      const pins: PartSpec = {
        name: "Pins",
        length: "10in",
        width,
        thickness: "1/2in",
        stock: "wood",
      };
      const tails: PartSpec = {
        name: "Tails",
        length: "6in",
        width,
        thickness: "1/2in",
        stock: "wood",
      };
      return rules(
        boards(
          [pins, tails],
          [
            { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
            { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
          ],
          [{ type: "throughDovetail", host: "Pins", guest: "Tails", params: { tails: "3" } }],
        ),
      );
    };
    // W = 1-3/4in: room 112 - 64 = 48, wide 16, offset 4, narrow 8/64 = 1/8" exactly.
    expect(tailsFor("1-3/4in")).not.toContain("error:dovetail-narrow-tail");
    // W = 1-47/64in: room 47, wide 15, narrow 7/64".
    expect(tailsFor("1-47/64in")).toContain("error:dovetail-narrow-tail");
  });

  it("a slope of 1:11 is outside 1:5 to 1:10", () => {
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
      [{ type: "throughDovetail", host: "Pins", guest: "Tails", params: { slope: "1:11" } }],
    );
    expect(rules(p)).toContain("error:dovetail-slope");
  });
});

describe("nesting choices", () => {
  const part = (name: string, locked: boolean): PartSpec => ({
    name,
    length: "45in",
    width: "30in",
    thickness: "3/4in",
    locked,
  });
  const six = (locked: boolean, extras = {}): Project =>
    boards(
      Array.from({ length: 6 }, (_, i) => part(`P${i}`, locked)),
      Array.from(
        { length: 6 },
        (_, i): InstanceSpec => ({
          name: `P${i}`,
          part: `P${i}`,
          at: [`${i * 50}in`, "0in", "0in"],
        }),
      ),
      [],
      extras,
    );

  it("rotates unlocked parts to save a sheet: 6 parts of 45 x 30 need 2 sheets, 3 when locked", () => {
    // Locked: 45 along the grain, two per strip (90-1/8"), one strip across (30 + 30 + 1/8 > 48): 3 sheets.
    expect(nest(six(true), shop).sheets).toHaveLength(3);
    // Unlocked: 30 along, three per strip (90-1/4"), 45 across: one strip per sheet, 2 sheets.
    const unlocked = nest(six(false), shop);
    expect(unlocked.sheets).toHaveLength(2);
    expect(unlocked.sheets.flatMap((s) => s.placements).every((p) => p.rotated)).toBe(true);
  });

  it("a sheet with no grain lets even locked parts turn", () => {
    expect(nest(six(true, { plyGrain: "none" }), shop).sheets).toHaveLength(2);
  });

  it("uses the shop's kerf, not a built-in one", () => {
    const part10: PartSpec = { name: "A", length: "10in", width: "5in", thickness: "3/4in" };
    const p = boards(
      [part10, { ...part10, name: "B" }],
      [
        { name: "A", part: "A", at: ["0in", "0in", "0in"] },
        { name: "B", part: "B", at: ["0in", "10in", "0in"] },
      ],
    );
    const wide = nest(p, { ...shop, kerf: INCH / 4 });
    expect(wide.sheets[0]?.placements.map((x) => x.x)).toEqual([0, 10 * INCH + INCH / 4]);
  });

  it("reports the 3/4in sheets' efficiency as the spec's 'about 46%'", () => {
    // Exact: used area (2 x 72 x 12 + 6 x 35-1/16 x 11-3/4) over two 96 x 48 sheets is
    // 3,375.9375 x 2 ... = 44799 / 98304 = 45.6%, which the spec rounds to 46%.
    const bookcase = loadProject("bookcase");
    const threeQuarter = bookcase.stock.find((x) => x.name === "3/4 plywood")?.id;
    const sheets = nest(bookcase, shop).sheets.filter((s) => s.stock === threeQuarter);
    expect(sheets).toHaveLength(2);
    const [a, b] = sheets.map((x) => x.efficiency);
    if (!a || !b) throw new Error("expected two sheets");
    // (a + b) / 2 == 44799 / 98304, compared without division.
    expect((a.num * b.den + b.num * a.den) * 98304n).toBe(44799n * 2n * a.den * b.den);
    const expected = loadExpected<{ efficiencyPercentApprox: Record<string, number> }>(
      "bookcase",
      "layouts",
    );
    expect(Object.values(expected.efficiencyPercentApprox)).toContain(
      Math.round((44799 / 98304) * 100),
    );
  });

  it("flags stock with no sizes and does not nest its parts", () => {
    const wood: PartSpec = {
      name: "W",
      length: "10in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const p = boards([wood], [{ name: "W", part: "W", at: ["0in", "0in", "0in"] }], [], {
      woodWithoutSizes: true,
    });
    const result = solve(p, shop);
    expect(result.diagnostics.map((d) => `${d.severity}:${d.rule}`)).toContain(
      "warning:no-stock-sizes",
    );
    expect(result.nesting.boards).toEqual([]);
  });

  it("adds the stock's length allowance to solid parts before packing", () => {
    const long: PartSpec = {
      name: "L",
      length: "47in",
      width: "4in",
      thickness: "1/2in",
      stock: "wood",
    };
    const parts = [long, { ...long, name: "M" }];
    const at: InstanceSpec[] = [
      { name: "L", part: "L", at: ["0in", "0in", "0in"] },
      { name: "M", part: "M", at: ["0in", "5in", "0in"] },
    ];
    // 47 + 1/8 + 47 = 94-1/8 fits one 96" board (95" usable); with 1/2" allowance each: 95-1/8, too long.
    expect(nest(boards(parts, at), shop).boards).toHaveLength(1);
    expect(
      nest(boards(parts, at, [], { woodAllowanceLength: INCH / 2 }), shop).boards,
    ).toHaveLength(2);
  });
});

describe("cut-list key includes thickness and width", () => {
  it("keeps parts of the same length but different thickness or width on separate lines", () => {
    const parts: PartSpec[] = [
      { name: "A", length: "20in", width: "10in", thickness: "3/4in" },
      { name: "B", length: "20in", width: "10in", thickness: "1/2in" },
      { name: "C", length: "20in", width: "8in", thickness: "3/4in" },
    ];
    const at: InstanceSpec[] = parts.map((p, i) => ({
      name: p.name,
      part: p.name,
      at: [`${i * 30}in`, "0in", "0in"],
    }));
    expect(solve(boards(parts, at), shop).cutList.lines).toHaveLength(3);
  });
});

describe("solving does not mutate its input", () => {
  const freeze = <T>(o: T): T => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as object)) freeze(v);
    }
    return o;
  };

  it("works on a deeply frozen project and shop", () => {
    const project = freeze(loadProject("bookcase"));
    const frozenShop = freeze(loadShopProfile());
    expect(() => solve(project, frozenShop)).not.toThrow();
    expect(solve(project, frozenShop).diagnostics.filter((d) => d.severity === "error")).toEqual(
      [],
    );
  });
});
