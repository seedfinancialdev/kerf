// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Sheet nesting (Cut list & nesting, "Optimization order"): guillotine strip packing.
//
// Every cut runs edge to edge, so layouts work on a table saw, track saw or panel saw: first rip the
// sheet into strips across its width, then crosscut each strip into parts. Candidate layouts come
// from a fixed set of orientations and orderings; the best is chosen by
//   1. fewest sheets, 2. largest usable offcut, 3. fewest cuts,
// and ties go to the earliest candidate, so the same project always gives the same layout.

import type { CutStep, Offcut, Placement, SheetLayout } from "../outputs";
import { rational } from "../rational";
import type { Id, Len } from "../types";
import { INCH } from "../units";

export interface SheetItem {
  instance: Id;
  name: string;
  /** Cut size. `length` is the part's length, normally laid along the grain. */
  length: Len;
  width: Len;
  /** True when the grain pins the part's length along the sheet. */
  locked: boolean;
  /**
   * A composite blank (continuous grain): its members, in order, laid end to end along the grain
   * ("along") or side by side across it ("across"), a kerf between each.
   */
  members?: Array<{ instance: Id; name: string; length: Len; width: Len }>;
  layout?: "along" | "across";
}

export interface SheetSpec {
  stock: Id;
  length: Len;
  width: Len;
}

export interface SheetOptions {
  kerf: Len;
  /** Edge trim removed from every side of the sheet. */
  trim: Len;
  /** Offcuts smaller than this on either side are waste, not offcuts. */
  minOffcut: Len;
}

export const DEFAULT_MIN_OFFCUT: Len = 6 * INCH;

interface Oriented {
  item: SheetItem;
  along: Len;
  across: Len;
  rotated: boolean;
}

interface Strip {
  across: Len;
  items: Oriented[];
  /** Length used so far, including the kerfs between parts. */
  used: Len;
}

interface Sheet {
  strips: Strip[];
  /** Width used so far, including the kerfs between strips. */
  used: Len;
}

type Ordering = "across" | "along" | "area";

function orient(item: SheetItem, mode: "natural" | "long-along" | "short-along"): Oriented {
  const natural = { along: item.length, across: item.width, rotated: false };
  const turned = { along: item.width, across: item.length, rotated: true };
  if (item.locked || mode === "natural") return { item, ...natural };
  const longAlong = item.length >= item.width ? natural : turned;
  const shortAlong = item.length >= item.width ? turned : natural;
  return { item, ...(mode === "long-along" ? longAlong : shortAlong) };
}

function sortOrdered(list: Oriented[], by: Ordering): Oriented[] {
  const key = (o: Oriented): number[] =>
    by === "across"
      ? [o.across, o.along]
      : by === "along"
        ? [o.along, o.across]
        : [o.along * o.across, o.across];
  // Stable: ties keep project order.
  return list
    .map((o, i) => ({ o, i }))
    .sort((x, y) => {
      const kx = key(x.o);
      const ky = key(y.o);
      for (let k = 0; k < kx.length; k += 1) {
        const d = (ky[k] ?? 0) - (kx[k] ?? 0);
        if (d !== 0) return d;
      }
      return x.i - y.i;
    })
    .map(({ o }) => o);
}

function pack(
  items: Oriented[],
  usableL: Len,
  usableW: Len,
  kerf: Len,
  seed: Sheet[] = [],
): Sheet[] {
  const sheets: Sheet[] = seed.map((sheet) => ({
    used: sheet.used,
    strips: sheet.strips.map((strip) => ({ ...strip, items: [...strip.items] })),
  }));
  const fitsAlong = (strip: Strip, along: Len): boolean =>
    strip.items.length === 0 ? along <= usableL : strip.used + kerf + along <= usableL;

  for (const o of items) {
    let placed = false;

    for (const sheet of sheets) {
      const strip = sheet.strips.find((s) => o.across <= s.across && fitsAlong(s, o.along));
      if (strip) {
        strip.used = strip.items.length === 0 ? o.along : strip.used + kerf + o.along;
        strip.items.push(o);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    for (const sheet of sheets) {
      const needed = sheet.strips.length === 0 ? o.across : sheet.used + kerf + o.across;
      if (needed <= usableW) {
        sheet.strips.push({ across: o.across, items: [o], used: o.along });
        sheet.used = needed;
        placed = true;
        break;
      }
    }
    if (placed) continue;

    sheets.push({ strips: [{ across: o.across, items: [o], used: o.along }], used: o.across });
  }
  return sheets;
}

function describeSheet(
  sheet: Sheet,
  spec: SheetSpec,
  options: SheetOptions,
  usableL: Len,
  usableW: Len,
): SheetLayout {
  const { kerf, trim, minOffcut } = options;
  const placements: Placement[] = [];
  const offcuts: Offcut[] = [];
  const rips: Len[] = [];
  const crosscutPatterns: Len[][] = [];
  const contents: SheetLayout["contents"] = [];
  let usedArea = 0n;

  let y = trim;
  for (const strip of sheet.strips) {
    rips.push(strip.across);
    const pattern: Len[] = [];
    let x = trim;
    for (const o of strip.items) {
      const members = o.item.members;
      if (members && members.length > 0) {
        // A composite is cut as one blank, then divided; show every member where it will end up.
        let cursor = 0;
        for (const [i, m] of members.entries()) {
          const along = o.item.layout === "across" ? m.length : m.length;
          const across = m.width;
          placements.push({
            x: x + (o.item.layout === "across" ? 0 : cursor),
            y: y + (o.item.layout === "across" ? cursor : 0),
            length: along,
            width: across,
            instance: m.instance,
            name: m.name,
            rotated: false,
            sequence: { n: i + 1, of: members.length },
          });
          usedArea += BigInt(along) * BigInt(across);
          const found = contents.find((c) => c.length === along && c.width === across);
          if (found) found.quantity += 1;
          else contents.push({ length: along, width: across, quantity: 1 });
          cursor += (o.item.layout === "across" ? across : along) + kerf;
        }
        pattern.push(o.along);
        x += o.along + kerf;
        continue;
      }
      placements.push({
        x,
        y,
        length: o.along,
        width: o.across,
        instance: o.item.instance,
        name: o.item.name,
        rotated: o.rotated,
      });
      pattern.push(o.along);
      usedArea += BigInt(o.along) * BigInt(o.across);
      const found = contents.find((c) => c.length === o.along && c.width === o.across);
      if (found) found.quantity += 1;
      else contents.push({ length: o.along, width: o.across, quantity: 1 });
      x += o.along + kerf;
    }
    // A crosscut after the last part leaves the remainder as an offcut.
    const remainder = usableL - (strip.used + kerf);
    const fullStrip = strip.items.length === 1 && strip.used === usableL;
    if (!fullStrip) crosscutPatterns.push(pattern);
    if (remainder > 0 && remainder >= minOffcut && strip.across >= minOffcut) {
      offcuts.push({ x: trim + strip.used + kerf, y, length: remainder, width: strip.across });
    }
    y += strip.across + kerf;
  }

  // What is left across the sheet after the last rip.
  const acrossLeft = usableW - (sheet.used + kerf);
  if (acrossLeft > 0 && acrossLeft >= minOffcut && usableL >= minOffcut) {
    offcuts.push({ x: trim, y: trim + sheet.used + kerf, length: usableL, width: acrossLeft });
  }

  // Distinct crosscut patterns, in order of first use.
  const distinct: Len[][] = [];
  for (const pattern of crosscutPatterns) {
    if (!distinct.some((d) => d.length === pattern.length && d.every((v, i) => v === pattern[i]))) {
      distinct.push(pattern);
    }
  }
  const cutSequence: CutStep[] = [
    { op: "rip", sizes: rips },
    ...distinct.map((sizes): CutStep => ({ op: "crosscut", sizes })),
  ];

  // Largest offcut by area; ties go to the first.
  let largest: Offcut | undefined;
  for (const off of offcuts) {
    if (
      !largest ||
      BigInt(off.length) * BigInt(off.width) > BigInt(largest.length) * BigInt(largest.width)
    ) {
      largest = off;
    }
  }
  const count = largest
    ? offcuts.filter((o) => o.length === largest?.length && o.width === largest?.width).length
    : 0;

  return {
    stock: spec.stock,
    sheet: { length: spec.length, width: spec.width },
    contents,
    cutSequence,
    largestOffcut: { alongGrain: largest?.length ?? 0, acrossGrain: largest?.width ?? 0, count },
    placements,
    offcuts,
    efficiency: rational(usedArea, BigInt(spec.length) * BigInt(spec.width)),
  };
}

interface Candidate {
  sheets: Sheet[];
  cuts: number;
  largest: bigint;
}

function score(sheets: Sheet[], usableL: Len, usableW: Len, kerf: Len, minOffcut: Len): Candidate {
  let largest = 0n;
  let cuts = 0;
  for (const sheet of sheets) {
    cuts += sheet.strips.length;
    for (const strip of sheet.strips) {
      cuts += strip.items.length;
      const remainder = usableL - (strip.used + kerf);
      if (remainder >= minOffcut && strip.across >= minOffcut) {
        const area = BigInt(remainder) * BigInt(strip.across);
        if (area > largest) largest = area;
      }
    }
    const acrossLeft = usableW - (sheet.used + kerf);
    if (acrossLeft >= minOffcut && usableL >= minOffcut) {
      const area = BigInt(usableL) * BigInt(acrossLeft);
      if (area > largest) largest = area;
    }
  }
  return { sheets, cuts, largest };
}

export interface SheetNesting {
  sheets: SheetLayout[];
  /** Items that cannot fit on one sheet at all, even rotated where allowed. */
  tooLarge: SheetItem[];
  /** Same-board groups that do not fit on a single sheet. */
  groupsTooLarge: SheetItem[][];
}

/**
 * Nests the items onto sheets of one stock. Each of `groups` must end up on a single sheet (a
 * "same board" match set); the items are then packed around them, sharing those sheets.
 */
export function nestSheets(
  items: SheetItem[],
  spec: SheetSpec,
  options: SheetOptions,
  groups: SheetItem[][] = [],
): SheetNesting {
  const usableL = spec.length - 2 * options.trim;
  const usableW = spec.width - 2 * options.trim;
  const tooLarge: SheetItem[] = [];
  const groupsTooLarge: SheetItem[][] = [];
  const fit: SheetItem[] = [];

  // Pack each group alone; a group that needs more than one sheet cannot satisfy its set.
  const seeds: Sheet[] = [];
  for (const group of groups) {
    const oriented = group.map((i) => orient(i, "natural"));
    const packed = pack(sortOrdered(oriented, "across"), usableL, usableW, options.kerf);
    if (packed.length === 1 && packed[0]) seeds.push(packed[0]);
    else groupsTooLarge.push(group);
  }
  for (const item of items) {
    const direct = item.length <= usableL && item.width <= usableW;
    const turned = !item.locked && item.width <= usableL && item.length <= usableW;
    (direct || turned ? fit : tooLarge).push(item);
  }
  if (fit.length === 0 && seeds.length === 0) return { sheets: [], tooLarge, groupsTooLarge };

  let best: Candidate | undefined;
  const orientations = ["natural", "long-along", "short-along"] as const;
  const orderings: Ordering[] = ["across", "along", "area"];
  for (const mode of orientations) {
    if (mode !== "natural" && fit.every((i) => i.locked)) continue; // identical to "natural"
    const oriented = fit.map((i) => orient(i, mode));
    // A part that only fits turned must be turned, whatever the mode says.
    const fixed = oriented.map((o) =>
      o.along <= usableL && o.across <= usableW
        ? o
        : { item: o.item, along: o.across, across: o.along, rotated: !o.rotated },
    );
    for (const by of orderings) {
      const candidate = score(
        pack(sortOrdered(fixed, by), usableL, usableW, options.kerf, seeds),
        usableL,
        usableW,
        options.kerf,
        options.minOffcut,
      );
      if (
        !best ||
        candidate.sheets.length < best.sheets.length ||
        (candidate.sheets.length === best.sheets.length &&
          (candidate.largest > best.largest ||
            (candidate.largest === best.largest && candidate.cuts < best.cuts)))
      ) {
        best = candidate;
      }
    }
  }
  if (!best) return { sheets: [], tooLarge, groupsTooLarge };
  return {
    sheets: best.sheets.map((s) => describeSheet(s, spec, options, usableL, usableW)),
    tooLarge,
    groupsTooLarge,
  };
}
