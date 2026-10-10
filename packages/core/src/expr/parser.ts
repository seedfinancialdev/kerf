// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Parser for parameter expressions: operators + - * /, parentheses, unary minus,
// references and the functions min, max, round, floor, ceil.

import type { Rational } from "../rational";
import { ExpressionError } from "./errors";
import { type Kind, type Token, tokenize } from "./lexer";

export type FunctionName = "min" | "max" | "round" | "floor" | "ceil";
const FUNCTIONS: ReadonlySet<string> = new Set(["min", "max", "round", "floor", "ceil"]);

export type Node =
  | { type: "number"; value: Rational; kind: Kind; position: number }
  | { type: "ref"; key: string; position: number }
  | { type: "negate"; arg: Node; position: number }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node; position: number }
  | { type: "call"; name: FunctionName; args: Node[]; position: number };

/** Lower-case, runs of non-alphanumerics become "_": "Top / Bottom" → "top_bottom". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Reference key for a part property, e.g. `Side.thickness` → `side.thickness`. */
export function partKey(partName: string, property: string): string {
  return `${slug(partName)}.${property}`;
}

/** Reference key for a stock property, e.g. `stock["3/4 plywood"].thickness`. */
export function stockKey(stockName: string, property: string): string {
  return `stock["${stockName}"].${property}`;
}

class Parser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
  ) {}

  parse(): Node {
    if (this.peek().type === "end") {
      throw new ExpressionError("Expression is empty", this.source, 0);
    }
    const node = this.additive();
    const trailing = this.peek();
    if (trailing.type !== "end") {
      throw new ExpressionError(
        "Unexpected input after the expression",
        this.source,
        trailing.position,
      );
    }
    return node;
  }

  private peek(): Token {
    const token = this.tokens[this.index];
    if (!token)
      throw new ExpressionError("Unexpected end of expression", this.source, this.source.length);
    return token;
  }

  private next(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private isOp(op: string): boolean {
    const token = this.peek();
    return token.type === "op" && token.op === op;
  }

  private expectOp(op: string): void {
    const token = this.next();
    if (token.type !== "op" || token.op !== op) {
      throw new ExpressionError(`Expected "${op}"`, this.source, token.position);
    }
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.op === "+" || token.op === "-")) {
        this.next();
        const right = this.multiplicative();
        left = { type: "binary", op: token.op, left, right, position: token.position };
      } else {
        return left;
      }
    }
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.op === "*" || token.op === "/")) {
        this.next();
        const right = this.unary();
        left = { type: "binary", op: token.op, left, right, position: token.position };
      } else {
        return left;
      }
    }
  }

  private unary(): Node {
    const token = this.peek();
    if (token.type === "op" && token.op === "-") {
      this.next();
      return { type: "negate", arg: this.unary(), position: token.position };
    }
    return this.primary();
  }

  private primary(): Node {
    const token = this.next();

    if (token.type === "number") return token;

    if (token.type === "op" && token.op === "(") {
      const inner = this.additive();
      this.expectOp(")");
      return inner;
    }

    if (token.type === "ident") {
      if (this.isOp("(")) return this.call(token.name, token.position);
      return this.reference(token.name, token.position);
    }

    throw new ExpressionError("Expected a value", this.source, token.position);
  }

  private call(name: string, position: number): Node {
    if (!FUNCTIONS.has(name)) {
      throw new ExpressionError(`Unknown function "${name}"`, this.source, position);
    }
    this.expectOp("(");
    const args: Node[] = [this.additive()];
    while (this.isOp(",")) {
      this.next();
      args.push(this.additive());
    }
    this.expectOp(")");
    return { type: "call", name: name as FunctionName, args, position };
  }

  private reference(first: string, position: number): Node {
    if (first === "stock" && this.isOp("[")) {
      this.next();
      const name = this.next();
      if (name.type !== "string") {
        throw new ExpressionError(
          'Expected a stock name in quotes, e.g. stock["3/4 plywood"]',
          this.source,
          name.position,
        );
      }
      this.expectOp("]");
      this.expectOp(".");
      const property = this.next();
      if (property.type !== "ident") {
        throw new ExpressionError("Expected a stock property", this.source, property.position);
      }
      return { type: "ref", key: stockKey(name.value, property.name), position };
    }

    if (this.isOp(".")) {
      this.next();
      const property = this.next();
      if (property.type !== "ident") {
        throw new ExpressionError("Expected a property name", this.source, property.position);
      }
      return { type: "ref", key: partKey(first, property.name), position };
    }

    return { type: "ref", key: first, position };
  }
}

/** Parses an expression. Throws ExpressionError with the offending position. */
export function parseExpression(source: string): Node {
  return new Parser(source, tokenize(source)).parse();
}

/** Reference keys used by an expression, in first-use order and without duplicates. */
export function referencesOf(node: Node): string[] {
  const seen = new Set<string>();
  const visit = (n: Node): void => {
    switch (n.type) {
      case "number":
        return;
      case "ref":
        seen.add(n.key);
        return;
      case "negate":
        visit(n.arg);
        return;
      case "binary":
        visit(n.left);
        visit(n.right);
        return;
      case "call":
        for (const arg of n.args) visit(arg);
        return;
    }
  };
  visit(node);
  return [...seen];
}
