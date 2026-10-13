// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Shared types and helpers for joint derivation (Operation specs, "Shared rules").

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import { gridSize, LengthRangeError, snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic, RemovalPrimitive } from "../outputs";
import { div, floor, type Rational, rational, toSafeInteger } from "../rational";
import type { RuleId } from "../rules";
import type { Frame } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { Id, Joint, Len } from "../types";
import { type JointParam, jointSetting } from "../words";

/** How much a joint adds to a part's cut size, at the end(s) it touches. */
export interface CutAdd {
  length: Len;
  width: Len;
}

export const NO_ADD: Readonly<CutAdd> = Object.freeze({ length: 0, width: 0 });

/** One cut a shop makes, for machining setups (Cut list & nesting, "Machining by setup"). */
export interface MachinedCut {
  host: Id;
  kind: "dado" | "groove" | "rabbet" | "dovetail";
  /** Cut width across the host face. */
  width: Len;
  /** Cut depth into the host. */
  depth: Len;
}

/** The result of one joint between one host instance and one guest instance. */
export interface PairCut {
  joint: Id;
  kind: "dado" | "rabbet" | "throughDovetail";
  host: Id;
  guest: Id;
  /** Removals on the host, in the host's definition space. */
  hostCuts: RemovalPrimitive[];
  /** Removals on the guest, in the guest's definition space. */
  guestCuts: RemovalPrimitive[];
  hostAdd: CutAdd;
  guestAdd: CutAdd;
  machined: MachinedCut[];
  /** Dovetail layout facts, for validation. */
  dovetail?: DovetailFacts;
}

export interface DovetailFacts {
  hostEnd: 0 | 1;
  guestEnd: 0 | 1;
  /** Which face of the host (local Z = 0 or T) the tail tips finish flush with. */
  hostTipSide: 0 | 1;
  /** Half-pin width at the tip along the width axis, in the tail board's frame: [edge0, edge1]. */
  halfPins: [Len, Len];
  /** The same half-pins in the pin board's own frame (swapped when its width axis is flipped). */
  hostHalfPins: [Len, Len];
  slopeOffset: Len;
  hostThickness: Len;
  guestThickness: Len;
  boardWidth: Len;
}

export interface DeriveContext {
  model: SolvedModel;
  units: UnitSystem;
  frame(instance: Id): Frame | undefined;
  /** Evaluates a joint parameter; reports on failure and returns undefined. */
  length(joint: Joint, key: JointParam, fallback?: Len): Len | undefined;
  expression(joint: Joint, key: JointParam): Quantity | undefined;
  error(
    rule: RuleId,
    message: string,
    extra?: Partial<Omit<Diagnostic, "severity" | "rule" | "message">>,
  ): void;
  warn(
    rule: RuleId,
    message: string,
    extra?: Partial<Omit<Diagnostic, "severity" | "rule" | "message">>,
  ): void;
  /**
   * Adds one "and N more" entry for each rule that hit the per-joint limit. Call once, at the end.
   */
  flush(): void;
  /** How many problems have been raised so far, counting those too many to show. */
  reported(): number;
  /** Rounds down to the grid. Defaults use this ("snapped down"). */
  floorToGrid(value: Rational): Len;
}

/** Rounds an exact value down onto the project grid (Operation specs: "snapped down"). */
export function floorOnGrid(value: Rational, units: UnitSystem): Len {
  const grid = gridSize(units);
  return toSafeInteger(floor(div(value, rational(BigInt(grid))))) * grid;
}

/** Builds the evaluation helpers a joint kind needs. */
export function makeContext(
  model: SolvedModel,
  units: UnitSystem,
  frames: Map<Id, Frame>,
  sink: Diagnostic[],
): DeriveContext {
  // A joint between large patterns can fail the same way thousands of times; say it once, with
  // a count, after showing the first few.
  const SHOWN = 5;
  const seen = new Map<string, { shown: number; hidden: number; sample: Diagnostic }>();
  let raised = 0;
  const report = (d: Diagnostic): void => {
    raised += 1;
    const key = `${d.severity}|${d.rule}|${d.joint ?? ""}`;
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { shown: 1, hidden: 0, sample: d });
      sink.push(d);
    } else if (entry.shown < SHOWN) {
      entry.shown += 1;
      sink.push(d);
    } else {
      entry.hidden += 1;
    }
  };

  const evaluate = (joint: Joint, key: JointParam): Quantity | undefined => {
    const source = joint.params[key];
    if (source === undefined) return undefined;
    try {
      return evaluateQuantity(source, model.scope);
    } catch (error) {
      if (error instanceof ExpressionError) {
        report({
          severity: "error",
          rule: error.reason === "limit" ? "limit-exceeded" : "expression-syntax",
          message: `${jointSetting(joint.type, key)} can't be worked out: ${error.message}.`,
          joint: joint.id,
          field: `joint ${key}`,
        });
        return undefined;
      }
      throw error;
    }
  };

  return {
    model,
    units,
    frame: (id) => frames.get(id),
    expression: evaluate,
    length: (joint, key, fallback) => {
      const q = evaluate(joint, key);
      if (!q) return fallback;
      if (q.kind !== "length") {
        report({
          severity: "error",
          rule: "type-mismatch",
          message: `${jointSetting(joint.type, key)} must be a length.`,
          joint: joint.id,
          field: `joint ${key}`,
        });
        return undefined;
      }
      try {
        return snapToGrid(q.value, units);
      } catch (error) {
        if (!(error instanceof LengthRangeError)) throw error;
        report({
          severity: "error",
          rule: "out-of-range",
          message: `${jointSetting(joint.type, key)} is too large: the limit is 100,000 inches.`,
          joint: joint.id,
          field: `joint ${key}`,
        });
        return undefined;
      }
    },
    error: (rule, message, extra = {}) => report({ severity: "error", rule, message, ...extra }),
    warn: (rule, message, extra = {}) => report({ severity: "warning", rule, message, ...extra }),
    flush: () => {
      for (const entry of seen.values()) {
        const { hidden, sample } = entry;
        if (hidden === 0) continue;
        entry.hidden = 0; // so a second call says nothing more
        sink.push({
          ...sample,
          message: `${sample.message} (and ${hidden} more like it)`,
          count: hidden,
        });
      }
    },
    reported: () => raised,
    floorToGrid: (value) => floorOnGrid(value, units),
  };
}
