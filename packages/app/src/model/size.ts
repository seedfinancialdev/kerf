// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a user types into a size or count field (design spec, "Number fields"; ADR 015, rule 3).
// The text is kept as typed (an expression), after the engine has checked it means the right kind
// of thing. Every message is the engine's or a plain instruction; nothing is silently dropped.

import {
  type Expr,
  ExpressionError,
  evaluateQuantity,
  formatLength,
  type Len,
  LengthRangeError,
  type Project,
  type Quantity,
  snapToGrid,
  solveModel,
} from "@kerf/core";

export type Reading = { ok: true; expr: Expr; value: Len } | { ok: false; message: string };
export type CountReading = { ok: true; expr: Expr; value: number } | { ok: false; message: string };

const capitalised = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Evaluates `text` over the project's names, without `self` so a field cannot refer to itself.
 * `label` is what the field is called on screen, for the message when it does.
 */
function evaluate(
  text: string,
  project: Project,
  self?: string,
  label = self && capitalised(self),
): { q: Quantity } | { message: string } {
  const scope: Record<string, Quantity> = { ...solveModel(project).scope };
  if (self !== undefined) delete scope[self];
  try {
    return { q: evaluateQuantity(text, scope) };
  } catch (error) {
    if (!(error instanceof ExpressionError)) throw error;
    if (self !== undefined && new RegExp(`\\b${self}\\b`).test(text)) {
      return { message: `${label} can't be worked out from itself.` };
    }
    return { message: error.message };
  }
}

/**
 * A length typed by the user, as the expression to store and its snapped value. Refuses one beyond
 * what a project allows. `self` is the parameter the field edits, which the text may not use;
 * `label` names the field in that refusal (default: the parameter's name).
 */
export function readLength(text: string, project: Project, self?: string, label?: string): Reading {
  if (text.trim() === "") return { ok: false, message: 'Type a length, like 30" or 762mm.' };
  const r = evaluate(text, project, self, label);
  if ("message" in r) return { ok: false, message: r.message };
  if (r.q.kind !== "length")
    return { ok: false, message: `"${text.trim()}" is not a length; add a unit (in, " or mm)` };
  try {
    return { ok: true, expr: text.trim(), value: snapToGrid(r.q.value, project.units) };
  } catch (error) {
    if (error instanceof LengthRangeError) return { ok: false, message: error.message };
    throw error;
  }
}

/** A whole number typed by the user (a count of shelves or bays). */
export function readCount(text: string, project: Project, self?: string): CountReading {
  const r = evaluate(text, project, self);
  if ("message" in r) return { ok: false, message: r.message };
  const { kind, value } = r.q;
  if (kind === "length" || value.den !== 1n || value.num < 0n)
    return { ok: false, message: "Type a whole number, like 4." };
  return { ok: true, expr: text.trim(), value: Number(value.num) };
}

/** A partition's place (ADR 014, D9): a length from the opening's left face, or a fraction of it. */
export function readPosition(
  text: string,
  project: Project,
): { ok: true; expr: Expr } | { ok: false; message: string } {
  const ask = 'Type a length like 12" or a fraction like 1/3.';
  if (text.trim() === "") return { ok: false, message: ask };
  const r = evaluate(text, project);
  if ("message" in r) return { ok: false, message: r.message };
  if (r.q.kind === "length") return { ok: true, expr: text.trim() };
  const { num, den } = r.q.value;
  return num > 0n && num < den ? { ok: true, expr: text.trim() } : { ok: false, message: ask };
}

/** The value of an expression in this project, snapped; undefined when it cannot be worked out. */
export function lengthOf(expr: Expr, project: Project): Len | undefined {
  const r = readLength(expr, project);
  return r.ok ? r.value : undefined;
}

/**
 * A length in internal units as an exact millimetre literal. Every whole number of units is an
 * exact decimal of millimetres (8000 units = 1 mm = 2^6 × 5^3), so nothing is rounded.
 */
export function exactLiteral(len: Len): Expr {
  const sign = len < 0 ? "-" : "";
  const units = Math.abs(len);
  const whole = Math.trunc(units / 8000);
  const millionths = (units % 8000) * 125;
  if (millionths === 0) return `${sign}${whole}mm`;
  const fraction = millionths.toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fraction}mm`;
}

/**
 * A length as the expression a field stores: an inch fraction for imperial (exact on the 1/64"
 * grid, and the form a woodworker reads) or an exact millimetre literal for metric.
 */
export function literalFor(len: Len, units: Project["units"]): Expr {
  return units === "imperial" ? formatLength(len, "imperial") : exactLiteral(len);
}
