// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Structure generators (Domain model v0, "Structures, openings & shop profile"). On every solve a
// structure emits ordinary parts, instances, patterns, joints and match sets, which then flow
// through the same pipeline as hand-made ones. Nothing here changes how a part is solved.
//
// Everything a generator makes carries its origin (`source` on parts, `generatedBy` on the rest)
// and an id derived from the structure, the part's role and the opening it sits in (ids.ts). A
// part the user has edited by hand is `detached`: it, its placements and its patterns are kept as
// saved, and the generator stops regenerating them.

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import { snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic } from "../outputs";
import { div, type Rational, rational } from "../rational";
import { solveModel } from "../solve/model";
import type {
  GeneratedFrom,
  Id,
  Instance,
  Joint,
  MatchSet,
  Opening,
  PartDef,
  Pattern,
  Project,
  ShopProfile,
  Stock,
  Structure,
} from "../types";
import { INCH } from "../units";
import { generatedId } from "./ids";
import { withoutGenerated } from "./strip";

/** Generated objects, before they are merged into a project. */
interface Generated {
  parts: PartDef[];
  instances: Instance[];
  patterns: Pattern[];
  joints: Joint[];
  matchSets: MatchSet[];
}

const empty = (): Generated => ({
  parts: [],
  instances: [],
  patterns: [],
  joints: [],
  matchSets: [],
});

/** Most boards of one kind a form may ask for; it decides how many parts are made. */
const MAX_COUNT = 64;

const STOCK_LABELS: Record<string, string> = {
  carcaseStock: "the sides, top and bottom",
  backStock: "the back",
  wallStock: "the walls",
  bottomStock: "the bottom",
};

const TEXT_OPTIONS = [
  "topBottom",
  "back",
  "dadoDepth",
  "rabbetDepth",
  "backRabbetDepth",
  "shelfRoundover",
  "cornerJoint",
  "bottom",
  "grooveDepth",
  "grooveOffset",
];

/** An exact length of `units` as an expression the solver reads back unchanged. */
const lit = (units: number): string => (units === 0 ? "0in" : `${units}/${INCH}in`);
const wrap = (e: string): string => `(${e})`;

/** Joint parameters from the form's depth options; absent means the spec's default rule applies. */
const depth = (value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { depth: value };

/** Rounds an exact value onto the project grid, half to even (Domain model, "Units & precision"). */
const snap = (value: Rational, units: UnitSystem): number => snapToGrid(value, units);

/** An opening's horizontal extent: expressions to write, and exact values to decide with. */
interface Span {
  x0: string;
  x1: string;
  /** Exact length values in units, or undefined when the size could not be evaluated. */
  n0?: Rational;
  n1?: Rational;
}

class Builder {
  readonly out = empty();
  readonly diagnostics: Diagnostic[] = [];
  private readonly counted = new Map<string, number>();
  private readonly checkedOptions = new Set<string>();

  constructor(
    readonly structure: Structure,
    private readonly stocks: Map<Id, Stock>,
    private readonly scope: Record<string, Quantity>,
    readonly units: UnitSystem,
    private readonly prefix: string,
    /** Roundover bit radii the shop owns, for `shelfRoundover: "auto"`. */
    readonly roundoverBits: readonly number[],
  ) {}

  id(key: string): Id {
    return generatedId(this.structure.id, key);
  }

  from(role: string): GeneratedFrom {
    return { structure: this.structure.id, role };
  }

  named(name: string): string {
    return `${this.prefix}${name}`;
  }

  report(severity: Diagnostic["severity"], rule: string, message: string, field: string): void {
    this.diagnostics.push({ severity, rule, message, field });
  }

  /** The stock a form field names, or undefined with a message that says what is wrong. */
  stock(option: string): Stock | undefined {
    const label = STOCK_LABELS[option] ?? option;
    const value = this.structure.options[option];
    if (value === undefined || value === "") {
      this.report(
        "error",
        "structure-stock-missing",
        `Choose the stock for ${label}; none is chosen.`,
        label,
      );
      return undefined;
    }
    const found = typeof value === "string" ? this.stocks.get(value) : undefined;
    if (!found) {
      this.report(
        "error",
        "structure-stock-missing",
        `The stock chosen for ${label} is no longer in the project; choose another.`,
        label,
      );
      return undefined;
    }
    if (/["\\]/.test(found.name)) {
      this.report(
        "error",
        "stock-name-unsupported",
        `The stock "${found.name}" has a quote or backslash in its name, which sizes cannot refer to; rename it.`,
        found.name,
      );
      return undefined;
    }
    return found;
  }

  /** `stock["name"].thickness`, the way the expression language refers to it. */
  thickness(stock: Stock): string {
    return `stock["${stock.name}"].thickness`;
  }

  /** A text option; a wrong-typed value is reported once and treated as absent. */
  option(key: string): string | undefined {
    const v = this.structure.options[key];
    if (v === undefined) return undefined;
    if (typeof v === "string") return v.trim() === "" ? undefined : v;
    this.badOption(key, "text");
    return undefined;
  }

  flag(key: string): boolean {
    const v = this.structure.options[key];
    if (v === undefined) return false;
    if (typeof v === "boolean") return v;
    this.badOption(key, "true or false");
    return false;
  }

  /** Reports every text option of the wrong type, so none is ignored without a word. */
  checkOptions(): void {
    for (const key of TEXT_OPTIONS) this.option(key);
    if (this.structure.type === "box") this.flag("grainWraps");
  }

  private badOption(key: string, wanted: string): void {
    if (this.checkedOptions.has(key)) return;
    this.checkedOptions.add(key);
    this.report("error", "invalid-option", `The form's "${key}" must be ${wanted}.`, key);
  }

  /** A whole number from 0 to 64, evaluated now because it decides how many boards are made. */
  count(expr: string, field: string): number {
    const cached = this.counted.get(`${field}:${expr}`);
    if (cached !== undefined) return cached;
    let result = 0;
    let why = `must be a whole number from 0 to ${MAX_COUNT}`;
    try {
      const q = evaluateQuantity(expr, this.scope);
      if (q.kind === "count" && q.value.den === 1n && q.value.num >= 0n && q.value.num <= 64n) {
        result = Number(q.value.num);
        this.counted.set(`${field}:${expr}`, result);
        return result;
      }
    } catch (error) {
      if (error instanceof ExpressionError) why = error.message;
    }
    this.report("error", "invalid-count", `The number of ${field} ${why}.`, field);
    this.counted.set(`${field}:${expr}`, 0);
    return 0;
  }

  /** An exact value of the expression, of the kind asked for. */
  quantity(expr: string): Quantity | undefined {
    try {
      return evaluateQuantity(expr, this.scope);
    } catch {
      return undefined;
    }
  }

  part(
    role: string,
    key: string,
    def: Omit<PartDef, "id" | "source" | "grainLocked" | "ops"> & { ops?: PartDef["ops"] },
  ): PartDef {
    const part: PartDef = {
      id: this.id(`part:${key}`),
      grainLocked: true,
      ops: [],
      ...def,
      name: this.named(def.name),
      source: this.from(role),
    };
    this.out.parts.push(part);
    return part;
  }

  instance(
    role: string,
    key: string,
    def: PartDef,
    at: [string, string, string],
    extra: { name?: string; orientation?: number; mirrored?: boolean } = {},
  ): Instance {
    const instance: Instance = {
      id: this.id(`inst:${key}`),
      def: def.id,
      position: { x: at[0], y: at[1], z: at[2] },
      orientation: extra.orientation ?? 0,
      mirrored: extra.mirrored ?? false,
      generatedBy: this.from(role),
      ...(extra.name !== undefined ? { name: this.named(extra.name) } : {}),
    };
    this.out.instances.push(instance);
    return instance;
  }

  joint(
    role: string,
    key: string,
    type: Joint["type"],
    host: Id,
    guest: Id,
    params: Record<string, string> = {},
  ): void {
    this.out.joints.push({
      id: this.id(`joint:${key}`),
      type,
      host,
      guest,
      params,
      generatedBy: this.from(role),
    });
  }
}

/**
 * The roundover radius a form asks for. `"auto"` takes the largest roundover bit the shop owns
 * that leaves room for a profile on both faces of the board (radius at most half its thickness);
 * with no such bit, or no shop, there is no roundover. Anything else is the expression as given.
 */
function roundoverFor(
  b: Builder,
  option: string | undefined,
  thickness: number,
): string | undefined {
  if (option !== "auto") return option;
  const fitting = b.roundoverBits.filter((radius) => radius > 0 && radius * 2 <= thickness);
  const largest = Math.max(0, ...fitting);
  return largest > 0 ? lit(largest) : undefined;
}

// ---- case ---------------------------------------------------------------------------------------

function generateCase(b: Builder): void {
  const { size } = b.structure;
  const carcase = b.stock("carcaseStock");
  if (!carcase) return;
  const T = b.thickness(carcase);
  const Tn = carcase.thickness;
  const W = wrap(size.w);
  const H = wrap(size.h);
  const D = wrap(size.d);

  // How the top and bottom meet the sides, and what kind of back the case has.
  let topBottom = b.option("topBottom") ?? "between-sides";
  if (topBottom !== "between-sides" && topBottom !== "sides-between") {
    b.report(
      "warning",
      "not-built-yet",
      `A case with "${topBottom}" is not built yet; the top and bottom go between the sides.`,
      "topBottom",
    );
    topBottom = "between-sides";
  }
  const sidesBetween = topBottom === "sides-between";
  let backStyle = b.option("back") ?? (b.option("backStock") ? "inset-rabbet" : "none");
  if (backStyle !== "none" && backStyle !== "inset-rabbet" && backStyle !== "applied") {
    b.report(
      "warning",
      "not-built-yet",
      `A case back of "${backStyle}" is not built yet; the case is built without a back.`,
      "back",
    );
    backStyle = "none";
  }
  const backStock = backStyle === "none" ? undefined : b.stock("backStock");
  const inset = backStyle === "inset-rabbet" && backStock !== undefined;
  const applied = backStyle === "applied" && backStock !== undefined;
  // An inset back sits in rabbets, taking that much depth from the boards in front of it; an
  // applied back covers the rear edges and takes none.
  const B = backStock && inset ? b.thickness(backStock) : "0in";
  const backThickness = backStock ? b.thickness(backStock) : "0in";
  const dado = depth(b.option("dadoDepth"));
  const rabbet = depth(b.option("rabbetDepth"));
  const backRabbet = depth(b.option("backRabbetDepth"));
  const roundover = roundoverFor(b, b.option("shelfRoundover"), Tn);
  const inner = `${W} - 2*${T}`;

  const sideZ = sidesBetween ? T : "0in";
  const sideDef = b.part("side", "side", {
    name: "Side",
    stock: carcase.id,
    length: sidesBetween ? `${H} - 2*${T}` : H,
    width: D,
  });
  const right = b.instance("side", "side:right", sideDef, ["0in", "0in", sideZ], {
    name: "Right side",
    orientation: 17,
  });
  const left = b.instance("side", "side:left", sideDef, [`${W} - ${T}`, "0in", sideZ], {
    name: "Left side",
    orientation: 23,
    mirrored: true,
  });
  const railLength = sidesBetween ? W : inner;
  const railX = sidesBetween ? "0in" : T;
  const topDef = b.part("top", "top", {
    name: "Top",
    stock: carcase.id,
    length: railLength,
    width: `${D} - ${B}`,
  });
  const bottomDef = b.part("bottom", "bottom", {
    name: "Bottom",
    stock: carcase.id,
    length: railLength,
    width: `${D} - ${B}`,
  });
  const top = b.instance("top", "top", topDef, [railX, B, `${H} - ${T}`], { name: "Top" });
  const bottom = b.instance("bottom", "bottom", bottomDef, [railX, B, "0in"], { name: "Bottom" });

  // The case's interior across, in expressions and (when the size evaluates) exact values.
  const wq = b.quantity(size.w);
  const wn = wq?.kind === "length" ? wq.value : undefined;
  const tn = rational(BigInt(Tn));
  const root: Span = {
    x0: T,
    x1: `${W} - ${T}`,
    ...(wn ? { n0: tn, n1: sub(wn, tn) } : {}),
  };

  const openingJoints: Array<() => void> = [];
  const planned = tally(b, b.structure.openings[0]);
  const multipleShelves = planned.shelfOpenings > 1;
  let shelfOpenings = 0;
  let partitions = 0;

  if (b.structure.openings.length > 1) {
    b.report(
      "warning",
      "division-ignored",
      "A case has one opening to divide; the others on the form are not used.",
      "openings",
    );
  }

  const place = (
    o: Opening | undefined,
    span: Span,
    leftBoard: Instance,
    rightBoard: Instance,
    key: string,
  ): void => {
    const d = o?.division;
    if (!o || !d) {
      if (o && o.children.length > 0) {
        b.report(
          "warning",
          "division-ignored",
          "An opening with nothing in it has sub-openings on the form that are not used.",
          "openings",
        );
      }
      return;
    }
    const unusedChildren = (used: number): void => {
      if (o.children.length > used) {
        b.report(
          "warning",
          "division-ignored",
          `This division uses ${used === 0 ? "no" : used} sub-opening${used === 1 ? "" : "s"}; ${o.children.length - used} more on the form ${o.children.length - used === 1 ? "is" : "are"} not used.`,
          "openings",
        );
      }
    };

    if (d.type === "shelves") {
      unusedChildren(0);
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
      shelfOpenings += 1;
      const name = multipleShelves ? `Shelf ${shelfOpenings}` : "Shelf";
      const def = b.part("shelf", `shelf:${key}`, {
        name,
        stock: carcase.id,
        length: `${wrap(span.x1)} - ${wrap(span.x0)}`,
        width: `${D} - ${B}`,
        ops: roundover
          ? [
              {
                id: b.id(`op:shelf:${key}`),
                type: "roundover",
                edges: ["edge1/face0", "edge1/face1"],
                radius: roundover,
              },
            ]
          : [],
      });
      const guests: Id[] = [];
      if (!heights) {
        const source = b.instance("shelf", `shelf:${key}`, def, [span.x0, B, T], { name });
        const pattern: Pattern = {
          id: b.id(`pat:shelf:${key}`),
          source: source.id,
          count: d.count,
          axis: "z",
          spacing: { mode: "distribute", from: T, to: `${H} - ${T}` },
          generatedBy: b.from("shelf"),
        };
        b.out.patterns.push(pattern);
        guests.push(pattern.id);
      } else {
        for (const [i, height] of heights.entries()) {
          const inst = b.instance("shelf", `shelf:${key}:${i}`, def, [span.x0, B, height], {
            name: `${name} (${i + 1})`,
          });
          guests.push(inst.id);
        }
      }
      for (const [i, guest] of guests.entries()) {
        openingJoints.push(() => {
          b.joint("shelf", `shelf:${key}:${i}:l`, "dado", leftBoard.id, guest, dado);
          b.joint("shelf", `shelf:${key}:${i}:r`, "dado", rightBoard.id, guest, dado);
        });
      }
      return;
    }

    // Partitions: one at a measurement or fraction, or (bays - 1) evenly spaced.
    const split = (offsets: Array<{ expr: string; units?: Rational }>, children: Span[]): void => {
      const boards: Instance[] = offsets.map((at, i) => {
        partitions += 1;
        const label = planned.partitions > 1 ? `Partition ${partitions}` : "Partition";
        const def = b.part("partition", `partition:${key}:${i}`, {
          name: label,
          stock: carcase.id,
          length: `${H} - 2*${T}`,
          width: `${D} - ${B}`,
        });
        const inst = b.instance(
          "partition",
          `partition:${key}:${i}`,
          def,
          [`${wrap(span.x0)} + ${wrap(at.expr)}`, B, T],
          { name: label, orientation: 17 },
        );
        openingJoints.push(() => {
          b.joint("partition", `partition:${key}:${i}:bottom`, "dado", bottom.id, inst.id, dado);
          b.joint("partition", `partition:${key}:${i}:top`, "dado", top.id, inst.id, dado);
        });
        return inst;
      });
      for (const [i, child] of children.entries()) {
        const l = i === 0 ? leftBoard : (boards[i - 1] as Instance);
        const r = i === children.length - 1 ? rightBoard : (boards[i] as Instance);
        const sub = o.children[i];
        place(sub, child, l, r, sub?.id ?? `${key}.${i}`);
      }
    };

    if (d.type === "partition") {
      unusedChildren(2);
      const q = b.quantity(d.at);
      let at: { expr: string; units: Rational } | undefined;
      if (q?.kind === "length") at = { expr: d.at, units: q.value };
      else if (q?.kind === "ratio" && span.n0 && span.n1) {
        const units = snap(mul(q.value, sub(span.n1, span.n0)), b.units);
        at = { expr: lit(units), units: rational(BigInt(units)) };
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
        const room = sub(sub(span.n1, span.n0), tn);
        if (at.units.num <= 0n || cmp(at.units, room) > 0) {
          b.report(
            "error",
            "partition-outside-opening",
            "The partition does not fit inside its opening: its position must leave room for the board on both sides.",
            "partition",
          );
          return;
        }
      }
      const leftEnd = `${wrap(span.x0)} + ${wrap(at.expr)}`;
      const rightStart = `${leftEnd} + ${T}`;
      const n0 = span.n0;
      const n1 = span.n1;
      split(
        [{ expr: at.expr, units: at.units }],
        [
          {
            x0: span.x0,
            x1: leftEnd,
            ...(n0 && n1 ? { n0, n1: add(n0, at.units) } : {}),
          },
          {
            x0: rightStart,
            x1: span.x1,
            ...(n0 && n1 ? { n0: add(add(n0, at.units), tn), n1 } : {}),
          },
        ],
      );
      return;
    }

    // Bays: n equal sections. Each partition's position is worked out exactly and snapped once
    // (half to even); a bay's width is the difference of the snapped faces, so shelves always
    // meet the partitions and bays differ by at most one grid step.
    const n = b.count(d.count, "bays");
    if (n < 2) {
      if (n === 1 || n === 0) {
        b.report(
          "warning",
          "division-ignored",
          "One bay is the opening itself; nothing is divided.",
          "bays",
        );
      }
      unusedChildren(0);
      return;
    }
    unusedChildren(n);
    if (!span.n0 || !span.n1) {
      b.report(
        "error",
        "invalid-option",
        "The bays cannot be sized because the case's width is not a length.",
        "bays",
      );
      return;
    }
    const inside = sub(sub(span.n1, span.n0), mul(tn, rational(BigInt(n - 1))));
    const bay = div(inside, rational(BigInt(n)));
    // Left face of partition k (1-based), measured from the opening's left face.
    const face = (k: number): number =>
      snap(add(mul(bay, rational(BigInt(k))), mul(tn, rational(BigInt(k - 1)))), b.units);
    const faces = Array.from({ length: n - 1 }, (_, k) => face(k + 1));
    const starts = [0, ...faces.map((f) => f + Tn)];
    const ends = [...faces, undefined];
    const narrowest = starts.reduce((least, from, k) => {
      const end = ends[k] ?? Number(span.n1 && span.n0 ? sub(span.n1, span.n0).num : 0n);
      return Math.min(least, end - from);
    }, Number.POSITIVE_INFINITY);
    if (narrowest <= 0) {
      b.report(
        "error",
        "bays-too-narrow",
        `${n} bays do not fit in this opening: the narrowest would have no width left.`,
        "bays",
      );
      return;
    }
    const offsets = faces.map((units) => ({ expr: lit(units), units: rational(BigInt(units)) }));
    const n0 = span.n0;
    const children = starts.map((from, k): Span => {
      const to = ends[k];
      return {
        x0: k === 0 ? span.x0 : `${wrap(span.x0)} + ${lit(from)}`,
        x1: to === undefined ? span.x1 : `${wrap(span.x0)} + ${lit(to)}`,
        n0: k === 0 ? n0 : add(n0, rational(BigInt(from))),
        n1: to === undefined ? (span.n1 as Rational) : add(n0, rational(BigInt(to))),
      };
    });
    split(offsets, children);
  };

  place(b.structure.openings[0], root, right, left, b.structure.openings[0]?.id ?? "0");

  let back: Instance | undefined;
  if (backStock && inset) {
    const backDef = b.part("back", "back", {
      name: "Back",
      stock: backStock.id,
      length: H,
      width: inner,
    });
    back = b.instance("back", "back", backDef, [T, "0in", "0in"], {
      name: "Back",
      orientation: 16,
    });
  } else if (backStock && applied) {
    // Covers the whole outside, flat against the rear edges; it is fixed on, not joined.
    const backDef = b.part("back", "back", {
      name: "Back",
      stock: backStock.id,
      length: H,
      width: W,
    });
    b.instance("back", "back", backDef, ["0in", `0in - ${backThickness}`, "0in"], {
      name: "Back",
      orientation: 16,
    });
  }

  for (const emit of openingJoints) emit();
  // Top and bottom are the hosts when they sit between the sides, the sides when it is the other
  // way round (the rabbet is always cut in the board whose end or edge receives the other).
  const carcaseJoints: Array<[Instance, Instance]> = sidesBetween
    ? [
        [top, right],
        [top, left],
        [bottom, right],
        [bottom, left],
      ]
    : [
        [right, top],
        [right, bottom],
        [left, top],
        [left, bottom],
      ];
  for (const [n, [host, guest]] of carcaseJoints.entries()) {
    b.joint("carcase", `rabbet:${n}`, "rabbet", host.id, guest.id, rabbet);
  }
  if (back) {
    b.joint("back", "back:right", "rabbet", right.id, back.id, backRabbet);
    b.joint("back", "back:left", "rabbet", left.id, back.id, backRabbet);
  }
}

// Exact-value helpers (rationals of internal units).
const add = (a: Rational, c: Rational): Rational =>
  rational(a.num * c.den + c.num * a.den, a.den * c.den);
const sub = (a: Rational, c: Rational): Rational =>
  rational(a.num * c.den - c.num * a.den, a.den * c.den);
const mul = (a: Rational, c: Rational): Rational => rational(a.num * c.num, a.den * c.den);
const cmp = (a: Rational, c: Rational): number => {
  const d = a.num * c.den - c.num * a.den;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};

/** How many shelf openings and partitions a case will have, so names are numbered only if needed. */
function tally(b: Builder, o: Opening | undefined): { shelfOpenings: number; partitions: number } {
  const d = o?.division;
  if (!o || !d) return { shelfOpenings: 0, partitions: 0 };
  let own = { shelfOpenings: 0, partitions: 0 };
  if (d.type === "shelves") own = { shelfOpenings: 1, partitions: 0 };
  else if (d.type === "partition") own = { shelfOpenings: 0, partitions: 1 };
  else own = { shelfOpenings: 0, partitions: Math.max(0, b.count(d.count, "bays") - 1) };
  return o.children
    .map((c) => tally(b, c))
    .reduce(
      (sum, c) => ({
        shelfOpenings: sum.shelfOpenings + c.shelfOpenings,
        partitions: sum.partitions + c.partitions,
      }),
      own,
    );
}

// ---- box ----------------------------------------------------------------------------------------

function generateBox(b: Builder): void {
  const { size } = b.structure;
  const wall = b.stock("wallStock");
  const bottomStock = b.option("bottom") === "none" ? undefined : b.stock("bottomStock");
  if (!wall) return;
  const Tw = b.thickness(wall);
  const L = wrap(size.w);
  const Wd = wrap(size.d);
  const H = wrap(size.h);
  let corner = b.option("cornerJoint") ?? "through-dovetail";
  if (corner !== "through-dovetail" && corner !== "rabbet") {
    b.report(
      "warning",
      "not-built-yet",
      `A box corner of "${corner}" is not built yet; the corners are through dovetails.`,
      "cornerJoint",
    );
    corner = "through-dovetail";
  }
  const rabbeted = corner === "rabbet";
  // A rabbeted corner has the front and back between the sides, their ends in rabbets cut in the
  // sides; dovetails interlock, so the front and back run the full length.
  const frontLength = rabbeted ? `${L} - 2*${Tw}` : L;
  const frontX = rabbeted ? Tw : "0in";
  // Left to itself the bottom sits one board's thickness above the wall's edge, so the groove
  // never breaks out through the bottom of the wall.
  const offset = b.option("grooveOffset") ?? (bottomStock ? b.thickness(bottomStock) : "0in");

  const frontDef = b.part("front", "front", {
    name: "Front",
    stock: wall.id,
    length: frontLength,
    width: H,
  });
  const backDef = b.part("back", "back", {
    name: "Back",
    stock: wall.id,
    length: frontLength,
    width: H,
  });
  const sideDef = b.part("side", "side", { name: "Side", stock: wall.id, length: Wd, width: H });
  const bottomDef = bottomStock
    ? b.part("bottom", "bottom", {
        name: "Bottom",
        stock: bottomStock.id,
        length: `${L} - 2*${Tw}`,
        width: `${Wd} - 2*${Tw}`,
      })
    : undefined;

  const front = b.instance("front", "front", frontDef, [frontX, "0in", "0in"], {
    name: "Front",
    orientation: 1,
  });
  const sideA = b.instance("side", "side:a", sideDef, ["0in", "0in", "0in"], {
    name: "Side A",
    orientation: 12,
  });
  const back = b.instance("back", "back", backDef, [frontX, `${Wd} - ${Tw}`, "0in"], {
    name: "Back",
    orientation: 3,
  });
  const sideB = b.instance("side", "side:b", sideDef, [`${L} - ${Tw}`, "0in", "0in"], {
    name: "Side B",
    orientation: 8,
  });
  const bottom = bottomDef
    ? b.instance("bottom", "bottom", bottomDef, [Tw, Tw, offset], { name: "Bottom" })
    : undefined;

  if (rabbeted) {
    const corners: Array<[Instance, Instance, string]> = [
      [sideA, front, "a-front"],
      [sideA, back, "a-back"],
      [sideB, front, "b-front"],
      [sideB, back, "b-back"],
    ];
    for (const [host, guest, key] of corners) {
      b.joint(
        "corner",
        `corner:${key}`,
        "rabbet",
        host.id,
        guest.id,
        depth(b.option("rabbetDepth")),
      );
    }
  } else {
    const corners: Array<[Instance, Instance, string]> = [
      [front, sideA, "front-a"],
      [front, sideB, "front-b"],
      [back, sideA, "back-a"],
      [back, sideB, "back-b"],
    ];
    for (const [host, guest, key] of corners) {
      b.joint("corner", `corner:${key}`, "throughDovetail", host.id, guest.id, {});
    }
  }
  if (bottom) {
    const groove = depth(b.option("grooveDepth"));
    const walls: Array<[Instance, string]> = [
      [front, "front"],
      [back, "back"],
      [sideA, "a"],
      [sideB, "b"],
    ];
    for (const [wallInstance, key] of walls) {
      b.joint("bottom", `groove:${key}`, "dado", wallInstance.id, bottom.id, groove);
    }
  }
  if (b.flag("grainWraps")) {
    b.out.matchSets.push({
      id: b.id("matchset:wrap"),
      name: b.named("Grain wraps the corners"),
      type: "continuousGrain",
      members: [front.id, sideA.id, back.id, sideB.id],
      axis: "length",
      generatedBy: b.from("grain"),
    });
  }
}

// ---- generating ---------------------------------------------------------------------------------

/** Runs the generators. Pure: the same project always gives the same result, ids included. */
export function generate(
  project: Project,
  shop?: ShopProfile,
): { project: Project; diagnostics: Diagnostic[] } {
  const base = withoutGenerated(project);
  if (project.structures.length === 0) return { project: base, diagnostics: [] };

  const stocks = new Map(project.stock.map((s) => [s.id, s]));
  const diagnostics: Diagnostic[] = [];
  const made = empty();
  const roundoverBits = (shop?.tools ?? []).flatMap((t) =>
    t.type === "router" ? t.roundoverBits : [],
  );
  let scope: Record<string, Quantity> = {};
  try {
    scope = solveModel(base).scope;
  } catch {
    scope = {};
  }
  for (const [index, structure] of project.structures.entries()) {
    // A second structure's boards are told apart by number so every name stays unique.
    const prefix = index === 0 ? "" : `${structure.type === "case" ? "Case" : "Box"} ${index + 1} `;
    const builder = new Builder(structure, stocks, scope, project.units, prefix, roundoverBits);
    builder.checkOptions();
    if (structure.type === "case") generateCase(builder);
    else generateBox(builder);
    diagnostics.push(...builder.diagnostics);
    made.parts.push(...builder.out.parts);
    made.instances.push(...builder.out.instances);
    made.patterns.push(...builder.out.patterns);
    made.joints.push(...builder.out.joints);
    made.matchSets.push(...builder.out.matchSets);
  }

  const fresh = <T extends { id: Id }>(have: T[], add: T[]): T[] => {
    const ids = new Set(have.map((x) => x.id));
    return add.filter((x) => !ids.has(x.id));
  };
  // A detached part is kept as saved; so are its placements and patterns.
  const detachedDefs = new Set(base.parts.filter((p) => p.detached).map((p) => p.id));
  const madeParts = new Set(made.parts.map((p) => p.id));
  for (const part of base.parts) {
    if (part.detached && part.source && !madeParts.has(part.id)) {
      diagnostics.push({
        severity: "warning",
        rule: "detached-board-orphaned",
        message: `${part.name} was edited by hand and the form no longer has a place for it.`,
        part: part.id,
        field: part.name,
      });
    }
  }
  const edited = new Map(made.parts.map((p) => [p.id, p]));
  for (const part of project.parts) {
    const generated = edited.get(part.id);
    if (
      generated &&
      part.source !== undefined &&
      !part.detached &&
      (part.length !== generated.length ||
        part.width !== generated.width ||
        part.thickness !== generated.thickness)
    ) {
      diagnostics.push({
        severity: "warning",
        rule: "generated-part-edited",
        message: `${part.name} was changed by hand, but the form still controls it; detach it to keep the change.`,
        part: part.id,
        field: part.name,
      });
    }
  }

  const generatedInstances = made.instances.filter((i) => !detachedDefs.has(i.def));
  const generatedPatterns = made.patterns.filter(
    (p) => !detachedDefs.has(made.instances.find((i) => i.id === p.source)?.def ?? ""),
  );
  const instances = [...base.instances, ...fresh(base.instances, generatedInstances)];
  const patterns = [...base.patterns, ...fresh(base.patterns, generatedPatterns)];
  const placed = new Set([...instances.map((i) => i.id), ...patterns.map((p) => p.id)]);
  // A joint or match set that names a board with no placement (a detached board whose copies the
  // form no longer places) cannot be made; it is dropped and counted rather than breaking the file.
  const joints = made.joints.filter((j) => placed.has(j.host) && placed.has(j.guest));
  const matchSets = made.matchSets.filter((m) => m.members.every((id) => placed.has(id)));
  const dropped = made.joints.length - joints.length + (made.matchSets.length - matchSets.length);
  if (dropped > 0) {
    diagnostics.push({
      severity: "warning",
      rule: "joint-dropped",
      message: `${dropped} joint${dropped === 1 ? " was" : "s were"} not made because a board edited by hand is not placed where the form expects it.`,
      field: "detached boards",
      count: dropped,
    });
  }
  return {
    project: {
      ...base,
      parts: [...base.parts, ...fresh(base.parts, made.parts)],
      instances,
      patterns,
      joints: [...base.joints, ...joints],
      matchSets: [...base.matchSets, ...matchSets],
    },
    diagnostics,
  };
}
