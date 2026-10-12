// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Through dovetail (Operation specs, "Through dovetail (corner joint)"): tails on the guest (tail
// board), pins on the host (pin board); both boards' ends are cut through their full thickness
// and finish flush.
//
// Layout, in integers (step numbers are the spec's):
//   1. wide tail width = (W - (n + 1) x p) / n
//   2. slope offset per side = t / slope denominator
//   3. narrow tail width = wide tail width - 2 x slope offset
//   4. not on the grid: snap down and split the leftover equally between the two edge half-pins;
//      an odd leftover grid step goes to the `edge0` side
//   5. baseline on each board = the mating board's thickness

import { gridSize, snapToGrid, type UnitSystem } from "../length";
import type { RemovalPrimitive } from "../outputs";
import { div, floor, fromInteger, rational, roundHalfEven, toSafeInteger } from "../rational";
import type { RuleId } from "../rules";
import type { Frame } from "../solve/assembly";
import { axisMaps, boxOf, boxToLocal, contactOf, faceAt, toParent } from "../solve/assembly";
import type { Joint, Len } from "../types";
import { INCH } from "../units";
import type { DeriveContext, PairCut } from "./types";

/** What a dovetail row is worked out from. */
export interface DovetailLayoutInput {
  boardWidth: Len;
  tails: number;
  pin: Len;
  matingThickness: Len;
  /** Slope denominator: 8 for 1:8. */
  slope: number;
}

export interface DovetailLayout {
  wideTailWidth: Len;
  slopeOffset: Len;
  narrowTailWidth: Len;
}

export const MIN_TAIL = INCH / 8;
export const MIN_PIN = INCH / 8;
export const SLOPE_RANGE = { min: 5, max: 10 } as const;

export interface FullLayout extends DovetailLayout {
  /** Tails at the tip (wide end) along the width axis, from edge0. */
  tails: Array<{ start: Len; end: Len }>;
  /** Width of the half-pins at the tip: [edge0, edge1]. */
  halfPins: [Len, Len];
}

export type LayoutProblem = "no-room" | "thin-pin" | "narrow-tail" | "slope";

/** Computes the dovetail layout, or says what is wrong with the inputs. */
export function layoutDovetail(
  input: DovetailLayoutInput,
  units: UnitSystem = "imperial",
): FullLayout | { problem: LayoutProblem } {
  const { boardWidth: W, tails: n, pin: p, matingThickness: t, slope } = input;
  if (!Number.isInteger(slope) || slope < SLOPE_RANGE.min || slope > SLOPE_RANGE.max) {
    return { problem: "slope" };
  }
  if (p < MIN_PIN) return { problem: "thin-pin" };
  if (!Number.isInteger(n) || n < 1) return { problem: "no-room" };

  const grid = gridSize(units);
  const room = W - (n + 1) * p;
  if (room <= 0) return { problem: "no-room" };

  // Step 1, snapped down to the grid (step 4).
  const wide = toSafeInteger(floor(div(rational(BigInt(room)), fromInteger(n * grid)))) * grid;
  if (wide <= 0) return { problem: "no-room" };

  // Step 2, kept on the grid.
  const offset = snapToGrid(rational(BigInt(t), BigInt(slope)), units);
  const narrow = wide - 2 * offset;
  if (narrow < MIN_TAIL) return { problem: "narrow-tail" };

  // Step 4: the leftover goes to the two edge half-pins in whole grid steps, the odd step to
  // edge0. Anything under a grid step (only possible if the inputs were not on the grid) also goes
  // to edge0, so every position stays an integer.
  const leftover = room - n * wide;
  const edge1 = Math.floor(leftover / grid / 2) * grid;
  const half0 = p + (leftover - edge1);
  const half1 = p + edge1;

  const tails: Array<{ start: Len; end: Len }> = [];
  for (let i = 0; i < n; i += 1) {
    const start = half0 + i * (wide + p);
    tails.push({ start, end: start + wide });
  }
  return {
    wideTailWidth: wide,
    slopeOffset: offset,
    narrowTailWidth: narrow,
    tails,
    halfPins: [half0, half1],
  };
}

/** The public layout check: wide tail, slope offset and narrow tail for the given inputs. */
export function dovetailLayout(
  input: DovetailLayoutInput,
  units: UnitSystem = "imperial",
): DovetailLayout {
  const result = layoutDovetail(input, units);
  if ("problem" in result) {
    throw new RangeError(`These dovetail inputs have no valid layout (${result.problem}).`);
  }
  return {
    wideTailWidth: result.wideTailWidth,
    slopeOffset: result.slopeOffset,
    narrowTailWidth: result.narrowTailWidth,
  };
}

function parseSlope(source: string | undefined): number | undefined {
  if (source === undefined) return 8; // hardwood default; the spec gives no way to tell species
  const match = /^\s*1\s*:\s*(\d+)\s*$/.exec(source);
  return match?.[1] ? Number(match[1]) : undefined;
}

export function deriveDovetail(
  ctx: DeriveContext,
  joint: Joint,
  host: Frame,
  guest: Frame,
  quiet = false,
): PairCut | undefined {
  const where = { joint: joint.id, part: host.part.id, field: `${host.instance.name} dovetail` };
  const hostName = host.instance.name;
  const guestName = guest.instance.name;
  const notCorner = (): undefined => {
    if (quiet) return undefined; // many candidate pairs between patterns: not every one is a corner
    ctx.error(
      "dovetail-not-corner",
      `${guestName} and ${hostName} do not meet at a right-angle corner, so they cannot be dovetailed.`,
      where,
    );
    return undefined;
  };

  const contact = contactOf(boxOf(host.instance), boxOf(guest.instance));
  if (contact.kind !== "overlap") return notCorner();

  const hostMaps = axisMaps(host.instance);
  const guestMaps = axisMaps(guest.instance);
  const hostLength = hostMaps[0].axis;
  const guestLength = guestMaps[0].axis;
  const hostThickness = hostMaps[2].axis;
  const guestThickness = guestMaps[2].axis;
  if (
    hostMaps[1].axis !== guestMaps[1].axis ||
    hostLength === guestLength ||
    hostThickness !== guestLength ||
    guestThickness !== hostLength
  ) {
    return notCorner();
  }

  const W = guest.part.width;
  if (host.part.width !== W) {
    ctx.error(
      "dovetail-width-mismatch",
      `${hostName} and ${guestName} are different widths; a dovetailed corner needs boards of equal width.`,
      where,
    );
    return undefined;
  }

  const Th = host.part.thickness;
  const Tg = guest.part.thickness;
  const Lh = host.part.length;
  const Lg = guest.part.length;

  // The overlap must be exactly the corner: guest thickness x host thickness x board width.
  const { region } = contact;
  const size = (axis: 0 | 1 | 2): number => region.max[axis] - region.min[axis];
  if (size(hostLength) !== Tg || size(guestLength) !== Th || size(hostMaps[1].axis) !== W) {
    return notCorner();
  }

  // Which end of each board is at the corner.
  const guestRegion = boxToLocal(guest, region);
  const hostRegion = boxToLocal(host, region);
  const guestEnd = guestRegion.min[0] === 0 ? 0 : guestRegion.max[0] === Lg ? 1 : undefined;
  const hostEnd = hostRegion.min[0] === 0 ? 0 : hostRegion.max[0] === Lh ? 1 : undefined;
  if (guestEnd === undefined || hostEnd === undefined) return notCorner();

  // The host face the tail tips finish flush with.
  const tipPlane = toParent(guest, [guestEnd === 0 ? 0 : Lg, 0, 0])[guestLength];
  const tipFace = faceAt(host, guestLength, tipPlane);
  if (tipFace?.axis !== 2) return notCorner();

  // Parameters.
  const slope = parseSlope(joint.params.slope);
  if (slope === undefined) {
    ctx.error("dovetail-slope", `The dovetail slope must be written like 1:8.`, where);
    return undefined;
  }
  const pin = ctx.length(joint, "pin", INCH / 4);
  const proud = ctx.length(joint, "proud", 0);
  if (pin === undefined || proud === undefined) return undefined;
  if (proud < 0) {
    ctx.error("invalid-parameter", 'The dovetail "proud" cannot be negative.', {
      ...where,
      field: "joint proud",
    });
    return undefined;
  }

  let tails: number | undefined;
  const tailsQ = ctx.expression(joint, "tails");
  if (tailsQ) {
    if (tailsQ.kind === "length" || tailsQ.value.den !== 1n) {
      ctx.error("type-mismatch", "The number of dovetail tails must be a whole number.", where);
      return undefined;
    }
    tails = toSafeInteger(tailsQ.value);
  } else {
    // Default: round(board width / 1-1/2"), at least 1.
    const ratio = div(rational(BigInt(W)), rational(BigInt((INCH * 3) / 2)));
    tails = Math.max(1, toSafeInteger(roundHalfEven(ratio)));
  }

  const layout = layoutDovetail(
    { boardWidth: W, tails, pin, matingThickness: Th, slope },
    ctx.units,
  );
  if ("problem" in layout) {
    const messages: Record<LayoutProblem, [RuleId, string]> = {
      slope: ["dovetail-slope", "The dovetail slope must be between 1:5 and 1:10."],
      "thin-pin": ["dovetail-thin-pin", 'The dovetail pins must be at least 1/8" wide.'],
      "narrow-tail": [
        "dovetail-narrow-tail",
        'The dovetail tails would be narrower than 1/8" at the neck; use fewer tails or wider boards.',
      ],
      "no-room": [
        "dovetail-no-room",
        "There is no room for that many dovetail tails and pins across the board.",
      ],
    };
    const [rule, message] = messages[layout.problem];
    ctx.error(rule, message, where);
    return undefined;
  }

  const { tails: tailSpans, slopeOffset: off } = layout;
  const gaps: Array<{ tip: [Len, Len]; base: [Len, Len] }> = [];
  for (let i = 0; i <= tailSpans.length; i += 1) {
    const before = tailSpans[i - 1];
    const after = tailSpans[i];
    const a = before ? before.end : 0;
    const b = after ? after.start : W;
    gaps.push({
      tip: [a, b],
      base: [before ? a - off : 0, after ? b + off : W],
    });
  }

  // Tail board (guest): the spaces between tails, cut through its thickness.
  const xTip = guestEnd === 0 ? 0 : Lg;
  const xBase = guestEnd === 0 ? Th : Lg - Th;
  const guestCuts: RemovalPrimitive[] = gaps.map((g) => ({
    kind: "trapezoidPrism",
    plane: "xy",
    points: [
      [xTip, g.tip[0]],
      [xTip, g.tip[1]],
      [xBase, g.base[1]],
      [xBase, g.base[0]],
    ],
    range: [0, Tg],
  }));

  // Pin board (host): a socket for each tail, through its thickness, over the corner's length.
  // The tail spans are measured from the guest's edge0; when the host's width axis points the
  // other way, its own edge0 is the guest's far edge, so the spans are mirrored across the width.
  const flipped = hostMaps[1].sign !== guestMaps[1].sign;
  const zTip = tipFace.side === 0 ? 0 : Th;
  const zBase = tipFace.side === 0 ? Th : 0;
  const range: [Len, Len] = hostEnd === 0 ? [0, Tg] : [Lh - Tg, Lh];
  const hostCuts: RemovalPrimitive[] = tailSpans
    .map((t) => (flipped ? { start: W - t.end, end: W - t.start } : t))
    .sort((a, b) => a.start - b.start)
    .map((t) => ({
      kind: "trapezoidPrism" as const,
      plane: "yz" as const,
      points: [
        [t.start, zTip],
        [t.end, zTip],
        [t.end - off, zBase],
        [t.start + off, zBase],
      ] as ReadonlyArray<readonly [Len, Len]>,
      range,
    }));

  return {
    joint: joint.id,
    kind: "throughDovetail",
    host: host.instance.id,
    guest: guest.instance.id,
    hostCuts,
    guestCuts,
    hostAdd: { length: proud, width: 0 },
    guestAdd: { length: proud, width: 0 },
    machined: [
      { host: host.instance.id, kind: "dovetail", width: layout.wideTailWidth, depth: Th },
    ],
    dovetail: {
      hostEnd,
      guestEnd,
      hostTipSide: tipFace.side,
      halfPins: layout.halfPins,
      hostHalfPins: flipped ? [layout.halfPins[1], layout.halfPins[0]] : layout.halfPins,
      slopeOffset: off,
      hostThickness: Th,
      guestThickness: Tg,
      boardWidth: W,
    },
  };
}
