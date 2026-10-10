// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Evaluator: exact rationals plus the type rules from the Domain model:
//   length ± length = length      length × count = length      length ÷ length = ratio
// Counts and ratios are "scalars" and combine freely; anything else is an error on the field.

import {
  add,
  ceil,
  compare,
  div,
  floor,
  mul,
  negate,
  type Rational,
  roundHalfEven,
  sub,
} from "../rational";
import { ExpressionError } from "./errors";
import type { Kind } from "./lexer";
import { type Node, parseExpression } from "./parser";

export interface Quantity {
  readonly value: Rational;
  readonly kind: Kind;
}

/** Values of everything an expression may reference, keyed by reference key. */
export type Scope = Readonly<Record<string, Quantity>>;

const isScalar = (kind: Kind): boolean => kind !== "length";

/** Longest numerator or denominator, in hexadecimal digits (1,024 bits). */
const MAX_HEX_DIGITS = 256;

function describe(kind: Kind): string {
  return kind === "length" ? "a length" : kind === "count" ? "a count" : "a ratio";
}

function combineScalars(a: Kind, b: Kind): Kind {
  return a === "count" && b === "count" ? "count" : "ratio";
}

/** Stops numbers from growing without bound inside one expression. */
function guarded(q: Quantity, source: string, position: number): Quantity {
  const size = (n: bigint): number => (n < 0n ? -n : n).toString(16).length;
  if (size(q.value.num) > MAX_HEX_DIGITS || size(q.value.den) > MAX_HEX_DIGITS) {
    throw new ExpressionError("This number is too large", source, position, "limit");
  }
  return q;
}

function evaluateNode(node: Node, scope: Scope, source: string): Quantity {
  switch (node.type) {
    case "number":
      return guarded({ value: node.value, kind: node.kind }, source, node.position);

    case "ref": {
      // Own properties only: "toString" and "constructor" are not names.
      const found = Object.hasOwn(scope, node.key) ? scope[node.key] : undefined;
      if (!found) throw new ExpressionError(`Unknown name "${node.key}"`, source, node.position);
      return found;
    }

    case "negate": {
      const arg = evaluateNode(node.arg, scope, source);
      return { value: negate(arg.value), kind: arg.kind };
    }

    case "binary": {
      const left = evaluateNode(node.left, scope, source);
      const right = evaluateNode(node.right, scope, source);
      return guarded(
        applyBinary(node.op, left, right, source, node.position),
        source,
        node.position,
      );
    }

    case "call": {
      const args = node.args.map((arg) => evaluateNode(arg, scope, source));
      return guarded(applyFunction(node.name, args, source, node.position), source, node.position);
    }
  }
}

function applyBinary(
  op: "+" | "-" | "*" | "/",
  left: Quantity,
  right: Quantity,
  source: string,
  position: number,
): Quantity {
  const fail = (): never => {
    throw new ExpressionError(
      `Cannot ${op === "+" ? "add" : op === "-" ? "subtract" : op === "*" ? "multiply" : "divide"} ${describe(left.kind)} and ${describe(right.kind)}`,
      source,
      position,
    );
  };

  if (op === "+" || op === "-") {
    const kind: Kind | null =
      left.kind === "length" && right.kind === "length"
        ? "length"
        : isScalar(left.kind) && isScalar(right.kind)
          ? combineScalars(left.kind, right.kind)
          : null;
    if (kind === null) return fail();
    return {
      value: op === "+" ? add(left.value, right.value) : sub(left.value, right.value),
      kind,
    };
  }

  // Multiplication: length × count = length; scalars combine; anything else is an error.
  if (op === "*") {
    if (left.kind === "length" && right.kind === "count") {
      return { value: mul(left.value, right.value), kind: "length" };
    }
    if (left.kind === "count" && right.kind === "length") {
      return { value: mul(left.value, right.value), kind: "length" };
    }
    if (isScalar(left.kind) && isScalar(right.kind)) {
      return { value: mul(left.value, right.value), kind: combineScalars(left.kind, right.kind) };
    }
    return fail();
  }

  // Division: length ÷ length = ratio; length ÷ count = length; scalars combine.
  if (right.value.num === 0n) {
    throw new ExpressionError("Division by zero", source, position);
  }
  if (left.kind === "length" && right.kind === "length") {
    return { value: div(left.value, right.value), kind: "ratio" };
  }
  if (left.kind === "length" && right.kind === "count") {
    return { value: div(left.value, right.value), kind: "length" };
  }
  if (isScalar(left.kind) && isScalar(right.kind)) {
    return { value: div(left.value, right.value), kind: "ratio" };
  }
  return fail();
}

function applyFunction(
  name: "min" | "max" | "round" | "floor" | "ceil",
  args: Quantity[],
  source: string,
  position: number,
): Quantity {
  if (name === "min" || name === "max") {
    const first = args[0];
    if (!first) throw new ExpressionError(`${name}() needs at least one value`, source, position);
    let best = first;
    for (const arg of args.slice(1)) {
      const sameKind = arg.kind === best.kind || (isScalar(arg.kind) && isScalar(best.kind));
      if (!sameKind) {
        throw new ExpressionError(
          `${name}() cannot compare ${describe(best.kind)} with ${describe(arg.kind)}`,
          source,
          position,
        );
      }
      const order = compare(arg.value, best.value);
      if (name === "min" ? order < 0 : order > 0) best = arg;
    }
    const kind = args.every((a) => a.kind === best.kind) ? best.kind : "ratio";
    return { value: best.value, kind };
  }

  const [only, ...rest] = args;
  if (!only || rest.length > 0) {
    throw new ExpressionError(`${name}() takes exactly one value`, source, position);
  }
  if (only.kind === "length") {
    throw new ExpressionError(
      `${name}() works on counts and ratios, not lengths; divide by a length first`,
      source,
      position,
    );
  }
  const rounded =
    name === "round"
      ? roundHalfEven(only.value)
      : name === "floor"
        ? floor(only.value)
        : ceil(only.value);
  return { value: rounded, kind: "count" };
}

/** Evaluates an expression with its value kind. Throws ExpressionError. */
export function evaluateQuantity(source: string, scope: Scope): Quantity {
  return evaluateNode(parseExpression(source), scope, source);
}
