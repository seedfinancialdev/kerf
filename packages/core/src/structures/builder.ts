// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The tools every generator is written with: a `Builder` that makes parts, placements, patterns
// and joints with derived ids and a recorded origin, reads the form's options and says when one is
// wrong, and collects the diagnostics. Which options and stocks a form has is told to it by the
// form (`FormSpec`), so this file knows nothing about cases or boxes.

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import type { UnitSystem } from "../length";
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
import { generatedId } from "./ids";
import { lit } from "./lengths";

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

/** The options a form reads, so a wrong one is reported and none is quietly ignored. */
export interface FormSpec {
  /** Option key of each stock the form uses, and how the user would call it ("the back"). */
  stockLabels: Readonly<Record<string, string>>;
  /** Options that are text (a style, a depth expression). */
  textOptions: readonly string[];
  /** Options that are true or false. */
  flags: readonly string[];
}

/** Joint parameters from the form's depth options; absent means the spec's default rule applies. */
export const depth = (value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { depth: value };

/** An opening's horizontal extent: expressions to write, and exact values to decide with. */
export interface Span {
  x0: string;
  x1: string;
  /** Exact length values in units, or undefined when the size could not be evaluated. */
  n0?: Rational;
  n1?: Rational;
}

/** The boards a repeated shelf is joined to, so a copy taken out of it can keep its joints. */
export interface PatternHosts {
  left: Id;
  right: Id;
  params: Record<string, string>;
  /** How many shelves the row has, so a copy taken out of it knows which row it left. */
  count: number;
}

export class Builder {
  readonly out = empty();
  readonly diagnostics: Diagnostic[] = [];
  readonly patternHosts = new Map<Id, PatternHosts>();
  private readonly counted = new Map<string, number>();
  private readonly checkedOptions = new Set<string>();

  constructor(
    readonly structure: Structure,
    private readonly spec: FormSpec,
    private readonly stocks: ReadonlyMap<Id, Stock>,
    private readonly scope: Readonly<Record<string, Quantity>>,
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
    const label = this.spec.stockLabels[option] ?? option;
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
    if (typeof value !== "string") {
      this.badOption(option, "the stock chosen from the project's stock");
      return undefined;
    }
    const found = this.stocks.get(value);
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

  /** A true-or-false option; a wrong-typed value is reported once and read as false. */
  flag(key: string): boolean {
    const v = this.structure.options[key];
    if (v === undefined) return false;
    if (typeof v === "boolean") return v;
    this.badOption(key, "true or false");
    return false;
  }

  /**
   * A text option that must be one of `allowed`. Anything else is said, with the choices, and
   * `fallback` is used so the rest of the form can still be checked.
   */
  choice<const T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.option(key);
    if (value === undefined) return fallback;
    const found = allowed.find((a) => a === value);
    if (found !== undefined) return found;
    this.report(
      "error",
      "invalid-option",
      `The form's "${key}" must be one of: ${allowed.join(", ")}.`,
      key,
    );
    return fallback;
  }

  /**
   * Reads every option the form has, so a wrong one is said even if nothing else uses it, and
   * names any setting the form does not have (usually a typo that would otherwise do nothing).
   */
  checkOptions(): void {
    for (const key of this.spec.textOptions) this.option(key);
    for (const key of this.spec.flags) this.flag(key);
    const known = new Set([
      ...Object.keys(this.spec.stockLabels),
      ...this.spec.textOptions,
      ...this.spec.flags,
    ]);
    for (const key of Object.keys(this.structure.options)) {
      if (!known.has(key)) {
        this.report(
          "warning",
          "unknown-option",
          `The form has a setting "${key}" that a ${this.structure.type} does not use.`,
          key,
        );
      }
    }
  }

  private badOption(key: string, wanted: string): void {
    if (this.checkedOptions.has(key)) return;
    this.checkedOptions.add(key);
    this.report("error", "invalid-option", `The form's "${key}" must be ${wanted}.`, key);
  }

  /** A whole number from 0 to `MAX_COUNT`, worked out now because it decides how many boards. */
  count(expr: string, field: string): number {
    const memo = `${field}:${expr}`;
    const cached = this.counted.get(memo);
    if (cached !== undefined) return cached;
    let result = 0;
    let message = `The number of ${field} must be a whole number from 0 to ${MAX_COUNT}.`;
    try {
      const q = evaluateQuantity(expr, this.scope);
      const n = q.value.num;
      if (q.kind === "count" && q.value.den === 1n && n >= 0n && n <= BigInt(MAX_COUNT)) {
        result = Number(n);
        this.counted.set(memo, result);
        return result;
      }
    } catch (error) {
      if (!(error instanceof ExpressionError)) throw error;
      message = `The number of ${field} is not valid: ${error.message}`;
    }
    this.report("error", "invalid-count", message, field);
    this.counted.set(memo, result);
    return result;
  }

  /** The exact value of an expression, or undefined when it does not evaluate. */
  quantity(expr: string): Quantity | undefined {
    try {
      return evaluateQuantity(expr, this.scope);
    } catch (error) {
      if (error instanceof ExpressionError) return undefined;
      throw error;
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
  if (largest > 0) return lit(largest);
  b.report(
    "warning",
    "roundover-no-bit",
    "The shelves are to be rounded over with a bit from your shop, but none of your roundover bits fits their thickness, so no edge profile is made.",
    "shelf roundover",
  );
  return undefined;
}
