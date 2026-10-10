// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Shared types and helpers for joint derivation (Operation specs, "Shared rules").

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import { gridSize, snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic, RemovalPrimitive } from "../outputs";
import { div, floor, type Rational, rational, toSafeInteger } from "../rational";
import type { Frame } from "../solve/assembly";
import type { SolvedModel } from "../solve/model";
import type { Id, Joint, Len } from "../types";

/** How much a joint adds to a part's cut size, at the end(s) it touches. */
export interface CutAdd {
  length: Len;
  width: Len;
}

export const NO_ADD: CutAdd = { length: 0, width: 0 };

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
}

export interface DeriveContext {
  model: SolvedModel;
  units: UnitSystem;
  frame(instance: Id): Frame | undefined;
  /** Evaluates a joint parameter; reports on failure and returns undefined. */
  length(joint: Joint, key: string, fallback?: Len): Len | undefined;
  expression(joint: Joint, key: string): Quantity | undefined;
  error(rule: string, message: string, extra?: Partial<Diagnostic>): void;
  warn(rule: string, message: string, extra?: Partial<Diagnostic>): void;
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
  const evaluate = (joint: Joint, key: string): Quantity | undefined => {
    const source = joint.params[key];
    if (source === undefined) return undefined;
    try {
      return evaluateQuantity(source, model.scope);
    } catch (error) {
      if (error instanceof ExpressionError) {
        sink.push({
          severity: "error",
          rule: error.reason === "limit" ? "limit-exceeded" : "expression-syntax",
          message: `${joint.type} ${key}: ${error.message}.`,
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
        sink.push({
          severity: "error",
          rule: "type-mismatch",
          message: `${joint.type} ${key} must be a length.`,
          joint: joint.id,
          field: `joint ${key}`,
        });
        return undefined;
      }
      return snapToGrid(q.value, units);
    },
    error: (rule, message, extra = {}) => sink.push({ severity: "error", rule, message, ...extra }),
    warn: (rule, message, extra = {}) =>
      sink.push({ severity: "warning", rule, message, ...extra }),
    floorToGrid: (value) => floorOnGrid(value, units),
  };
}
