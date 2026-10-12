// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Dividing an opening (Interaction spec, "Divide"): shelves, one partition at a measurement or a
// fraction, or N equal bays. A partition makes two child openings and bays make N, each divided in
// turn from the form's own tree, so a bay can hold shelves or another partition.
//
// Positions are exact until a board's own place is written: a partition's left face is worked out
// as an exact length and snapped once (half to even), and everything beside it is measured from
// that snapped face. That is what lets a shelf meet its partition to the grid line.

import type { Rational } from "../rational";
import { add, compare, div, mul, rational, sub } from "../rational";
import type { Id, Instance, Opening, Pattern } from "../types";
import { type Builder, lit, MAX_COUNT, type Span, snap, wrap } from "./builder";

/** What dividing needs to know about the case around the opening. */
export interface DivisionContext {
  /** The stock of every board a division makes. */
  stock: Id;
  /** `stock["…"].thickness`, and the same in units. */
  thickness: string;
  thicknessUnits: number;
  /** Case height and depth as expressions, already parenthesised. */
  height: string;
  depth: string;
  /** What an inset back takes from the depth of boards in front of it ("0in" when none). */
  backTaken: string;
  /** Joint parameters for the dados a shelf or partition sits in. */
  dado: Record<string, string>;
  /** The roundover radius for shelves, if any. */
  roundover: string | undefined;
  top: Instance;
  bottom: Instance;
}

/** How many shelf openings and partitions a form will have, so names are numbered only if needed. */
function tally(b: Builder, o: Opening | undefined): { shelfOpenings: number; partitions: number } {
  const d = o?.division;
  if (!o || !d) return { shelfOpenings: 0, partitions: 0 };
  let own = { shelfOpenings: 0, partitions: 0 };
  if (d.type === "shelves") own = { shelfOpenings: 1, partitions: 0 };
  else if (d.type === "partition") own = { shelfOpenings: 0, partitions: 1 };
  else own = { shelfOpenings: 0, partitions: Math.max(0, b.count(d.count, "bays") - 1) };
  return o.children
    .map((child) => tally(b, child))
    .reduce(
      (sum, c) => ({
        shelfOpenings: sum.shelfOpenings + c.shelfOpenings,
        partitions: sum.partitions + c.partitions,
      }),
      own,
    );
}

/** A board standing between two others, and its position as an expression and (if known) a value. */
interface Offset {
  expr: string;
  units: Rational;
}

export class Divider {
  private readonly pending: Array<() => void> = [];
  private readonly planned: { shelfOpenings: number; partitions: number };
  private shelfOpenings = 0;
  private partitions = 0;
  private readonly tn: Rational;

  constructor(
    private readonly b: Builder,
    private readonly c: DivisionContext,
  ) {
    this.planned = tally(b, b.structure.openings[0]);
    this.tn = rational(BigInt(c.thicknessUnits));
  }

  /** Makes the joints of everything divided so far; call once, after the rest of the case. */
  emitJoints(): void {
    for (const emit of this.pending) emit();
  }

  /** Divides `o` between `left` and `right`, then each child opening in turn. */
  divide(o: Opening | undefined, span: Span, left: Instance, right: Instance, key: string): void {
    const d = o?.division;
    if (!o || !d) {
      if (o && o.children.length > 0) {
        this.b.report(
          "warning",
          "division-ignored",
          "An opening with nothing in it has sub-openings on the form that are not used.",
          "openings",
        );
      }
      return;
    }
    if (d.type === "shelves") this.shelves(o, d, span, left, right, key);
    else if (d.type === "partition") this.partitionAt(o, d.at, span, left, right, key);
    else this.bays(o, d.count, span, left, right, key);
  }

  /** Says that an opening has more sub-openings than its division uses. */
  private unusedChildren(o: Opening, used: number): void {
    const extra = o.children.length - used;
    if (extra <= 0) return;
    this.b.report(
      "warning",
      "division-ignored",
      `This division uses ${used === 0 ? "no" : used} sub-opening${used === 1 ? "" : "s"}; ${extra} more on the form ${extra === 1 ? "is" : "are"} not used.`,
      "openings",
    );
  }

  private shelves(
    o: Opening,
    d: Extract<NonNullable<Opening["division"]>, { type: "shelves" }>,
    span: Span,
    left: Instance,
    right: Instance,
    key: string,
  ): void {
    const { b, c } = this;
    this.unusedChildren(o, 0);
    const heights = d.spacing === "even" ? undefined : d.spacing;
    if (heights && heights.length > MAX_COUNT) {
      b.report(
        "error",
        "invalid-count",
        `The number of shelves must be at most ${MAX_COUNT}.`,
        "shelves",
      );
      return;
    }
    const n = heights ? heights.length : b.count(d.count, "shelves");
    if (heights) {
      const said = b.quantity(d.count);
      if (said?.kind === "count" && said.value.den === 1n && Number(said.value.num) !== n) {
        b.report(
          "warning",
          "division-ignored",
          "Shelves at set heights ignore the count; the heights listed are used.",
          "shelves",
        );
      }
    }
    if (n === 0) return;

    this.shelfOpenings += 1;
    const name = this.planned.shelfOpenings > 1 ? `Shelf ${this.shelfOpenings}` : "Shelf";
    const def = b.part("shelf", `shelf:${key}`, {
      name,
      stock: c.stock,
      length: `${wrap(span.x1)} - ${wrap(span.x0)}`,
      width: `${c.depth} - ${c.backTaken}`,
      ops: c.roundover
        ? [
            {
              id: b.id(`op:shelf:${key}`),
              type: "roundover",
              edges: ["edge1/face0", "edge1/face1"],
              radius: c.roundover,
            },
          ]
        : [],
    });

    const guests: Id[] = [];
    if (!heights) {
      const source = b.instance("shelf", `shelf:${key}`, def, [span.x0, c.backTaken, c.thickness], {
        name,
      });
      const pattern: Pattern = {
        id: b.id(`pat:shelf:${key}`),
        source: source.id,
        count: d.count,
        axis: "z",
        spacing: { mode: "distribute", from: c.thickness, to: `${c.height} - ${c.thickness}` },
        generatedBy: b.from("shelf"),
      };
      b.out.patterns.push(pattern);
      b.patternHosts.set(pattern.id, { left: left.id, right: right.id, params: c.dado });
      guests.push(pattern.id);
    } else {
      for (const [i, height] of heights.entries()) {
        const copy = b.instance("shelf", `shelf:${key}:${i}`, def, [span.x0, c.backTaken, height], {
          name: `${name} (${i + 1})`,
        });
        guests.push(copy.id);
      }
    }
    for (const [i, guest] of guests.entries()) {
      this.pending.push(() => {
        b.joint("shelf", `shelf:${key}:${i}:l`, "dado", left.id, guest, c.dado);
        b.joint("shelf", `shelf:${key}:${i}:r`, "dado", right.id, guest, c.dado);
      });
    }
  }

  /** One partition, `at` from the opening's left face, as a length or a fraction of its width. */
  private partitionAt(
    o: Opening,
    at: string,
    span: Span,
    left: Instance,
    right: Instance,
    key: string,
  ): void {
    const { b } = this;
    this.unusedChildren(o, 2);
    const q = b.quantity(at);
    let offset: Offset;
    if (q?.kind === "length") offset = { expr: at, units: q.value };
    else if (q?.kind === "ratio" && span.n0 && span.n1) {
      const units = snap(mul(q.value, sub(span.n1, span.n0)), b.units);
      offset = { expr: lit(units), units: rational(BigInt(units)) };
    } else {
      b.report(
        "error",
        "invalid-option",
        "A partition's position must be a length or a fraction of the opening.",
        "partition",
      );
      return;
    }
    if (span.n0 && span.n1) {
      const room = sub(sub(span.n1, span.n0), this.tn);
      if (offset.units.num <= 0n || compare(offset.units, room) > 0) {
        b.report(
          "error",
          "partition-outside-opening",
          "The partition does not fit inside its opening: its position must leave room for the board on both sides.",
          "partition",
        );
        return;
      }
    }
    const leftEnd = `${wrap(span.x0)} + ${wrap(offset.expr)}`;
    const { n0, n1 } = span;
    const exact = n0 && n1;
    this.split(
      o,
      span,
      [offset],
      [
        { x0: span.x0, x1: leftEnd, ...(exact ? { n0, n1: add(n0, offset.units) } : {}) },
        {
          x0: `${leftEnd} + ${this.c.thickness}`,
          x1: span.x1,
          ...(exact ? { n0: add(add(n0, offset.units), this.tn), n1 } : {}),
        },
      ],
      left,
      right,
      key,
    );
  }

  /**
   * N equal bays. Each partition's position is worked out exactly and snapped once (half to even);
   * a bay's width is the difference of the snapped faces, so shelves always meet the partitions
   * and bays differ by at most one grid step.
   */
  private bays(
    o: Opening,
    countExpr: string,
    span: Span,
    left: Instance,
    right: Instance,
    key: string,
  ): void {
    const { b } = this;
    const n = b.count(countExpr, "bays");
    if (n < 2) {
      if (n === 1 || n === 0) {
        b.report(
          "warning",
          "division-ignored",
          "One bay is the opening itself; nothing is divided.",
          "bays",
        );
      }
      this.unusedChildren(o, 0);
      return;
    }
    this.unusedChildren(o, n);
    const { n0, n1 } = span;
    if (!n0 || !n1) {
      b.report(
        "error",
        "invalid-option",
        "The bays cannot be sized because the case's width is not a length.",
        "bays",
      );
      return;
    }
    const Tn = this.c.thicknessUnits;
    const width = sub(n1, n0);
    const bay = div(sub(width, mul(this.tn, rational(BigInt(n - 1)))), rational(BigInt(n)));
    // Left face of partition k (1-based), measured from the opening's left face.
    const faces = Array.from({ length: n - 1 }, (_, k) =>
      snap(add(mul(bay, rational(BigInt(k + 1))), mul(this.tn, rational(BigInt(k)))), b.units),
    );
    const starts = [0, ...faces.map((f) => f + Tn)];
    const ends = [...faces, undefined];
    const widest = Number(width.num / width.den);
    const narrowest = Math.min(...starts.map((from, k) => (ends[k] ?? widest) - from));
    if (narrowest <= 0) {
      b.report(
        "error",
        "bays-too-narrow",
        `${n} bays do not fit in this opening: the narrowest would have no width left.`,
        "bays",
      );
      return;
    }
    const children = starts.map((from, k): Span => {
      const to = ends[k];
      return {
        x0: k === 0 ? span.x0 : `${wrap(span.x0)} + ${lit(from)}`,
        x1: to === undefined ? span.x1 : `${wrap(span.x0)} + ${lit(to)}`,
        n0: k === 0 ? n0 : add(n0, rational(BigInt(from))),
        n1: to === undefined ? n1 : add(n0, rational(BigInt(to))),
      };
    });
    const offsets = faces.map((units) => ({ expr: lit(units), units: rational(BigInt(units)) }));
    this.split(o, span, offsets, children, left, right, key);
  }

  /** Makes the partitions at `offsets`, then divides each child opening between its neighbours. */
  private split(
    o: Opening,
    span: Span,
    offsets: Offset[],
    children: Span[],
    left: Instance,
    right: Instance,
    key: string,
  ): void {
    const { b, c } = this;
    const boards = offsets.map((offset, i) => {
      this.partitions += 1;
      const label = this.planned.partitions > 1 ? `Partition ${this.partitions}` : "Partition";
      const def = b.part("partition", `partition:${key}:${i}`, {
        name: label,
        stock: c.stock,
        length: `${c.height} - 2*${c.thickness}`,
        width: `${c.depth} - ${c.backTaken}`,
      });
      const board = b.instance(
        "partition",
        `partition:${key}:${i}`,
        def,
        [`${wrap(span.x0)} + ${wrap(offset.expr)}`, c.backTaken, c.thickness],
        { name: label, orientation: 17 },
      );
      this.pending.push(() => {
        b.joint("partition", `partition:${key}:${i}:bottom`, "dado", c.bottom.id, board.id, c.dado);
        b.joint("partition", `partition:${key}:${i}:top`, "dado", c.top.id, board.id, c.dado);
      });
      return board;
    });
    for (const [i, child] of children.entries()) {
      const before = i === 0 ? left : (boards[i - 1] as Instance);
      const after = i === children.length - 1 ? right : (boards[i] as Instance);
      const sub = o.children[i];
      this.divide(sub, child, before, after, sub?.id ?? `${key}.${i}`);
    }
  }
}
