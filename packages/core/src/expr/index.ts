// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import type { Rational } from "../rational";
import { evaluateQuantity, type Quantity, type Scope } from "./evaluate";

export { ExpressionError } from "./errors";
export type { Quantity, Scope } from "./evaluate";
export { evaluateQuantity } from "./evaluate";
export type { Kind } from "./lexer";
export type { Node } from "./parser";
export { parseExpression, partKey, referencesOf, slug, stockKey } from "./parser";

/** Evaluates an expression to its exact value. Throws ExpressionError. */
export function evaluateExpression(source: string, scope: Scope): Rational {
  const result: Quantity = evaluateQuantity(source, scope);
  return result.value;
}
