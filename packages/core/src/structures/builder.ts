// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What every structure generator works with: the `Builder` that makes parts, placements, patterns
// and joints with derived ids and a recorded origin, reads the form's options (and says when one
// is wrong), and keeps the diagnostics. Nothing here knows what a case or a box is.

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import { snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic } from "../outputs";
import type { Rational } from "../rational";
import type { RuleId } from "../rules";
import type {
  GeneratedFrom,
  Id,
  Instance,
  Joint,
  MatchSet,
  PartDef,
  Pattern,
  Stock,
  Structure,
} from "../types";
import { INCH } from "../units";
import { generatedId } from "./ids";

/** Generated objects, before they are merged into a project. */
export interface Generated {
  parts: PartDef[];
  instances: Instance[];
  patterns: Pattern[];
  joints: Joint[];
  matchSets: MatchSet[];
}

export const empty = (): Generated => ({
  parts: [],
  instances: [],
  patterns: [],
  joints: [],
  matchSets: [],
});

/** Most boards of one kind a form may ask for; it decides how many parts are made. */
export const MAX_COUNT = 64;

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
export const lit = (units: number): string => (units === 0 ? "0in" : `${units}/${INCH}in`);
export const wrap = (e: string): string => `(${e})`;

/** Joint parameters from the form's depth options; absent means the spec's default rule applies. */
export const depth = (value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { depth: value };

/** Rounds an exact value onto the project grid, half to even (Domain model, "Units & precision"). */
export const snap = (value: Rational, units: UnitSystem): number => snapToGrid(value, units);

/** An opening's horizontal extent: expressions to write, and exact values to decide with. */
export interface Span {
  x0: string;
  x1: string;
  /** Exact length values in units, or undefined when the size could not be evaluated. */
  n0?: Rational;
  n1?: Rational;
}

export class Builder {
  readonly out = empty();
  readonly diagnostics: Diagnostic[] = [];
  /** For each shelf pattern: the boards it is joined to, so a detached copy can keep its joints. */
  readonly patternHosts = new Map<Id, { left: Id; right: Id; params: Record<string, string> }>();
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

  report(severity: Diagnostic["severity"], rule: RuleId, message: string, field: string): void {
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
export function roundoverFor(
  b: Builder,
  option: string | undefined,
  thickness: number,
): string | undefined {
  if (option !== "auto") return option;
  const fitting = b.roundoverBits.filter((radius) => radius > 0 && radius * 2 <= thickness);
  const largest = Math.max(0, ...fitting);
  return largest > 0 ? lit(largest) : undefined;
}
