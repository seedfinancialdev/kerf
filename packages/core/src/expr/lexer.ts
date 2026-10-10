// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Tokenizer for parameter expressions (Domain model v0, "Parameter expressions").
//
// Literals: 36in, 36", 3/4", 23/32in, 1-1/2", 18mm, 4, and exact decimals such as 12.5mm.
// A fraction or mixed number only lexes as one literal when a unit follows it directly:
// `3/4"` is three quarters of an inch, while `3/4` is the ratio 3 divided by 4.

import { mul, type Rational, rational } from "../rational";
import { INCH, MM } from "../units";
import { ExpressionError } from "./errors";

export type Kind = "length" | "count" | "ratio";

export type Token =
  | { type: "number"; value: Rational; kind: Kind; position: number }
  | { type: "ident"; name: string; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "op"; op: "+" | "-" | "*" | "/" | "(" | ")" | "[" | "]" | "." | ","; position: number }
  | { type: "end"; position: number };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const UNIT = /(in|mm|")(?![A-Za-z0-9_])/y;
const MIXED = /(\d+)-(\d+)\/(\d+)/y;
const FRACTION = /(\d+)\/(\d+)/y;
const DECIMAL = /(\d+)(?:\.(\d+))?/y;

function unitScale(unit: string): bigint {
  return BigInt(unit === "mm" ? MM : INCH);
}

function matchAt(re: RegExp, source: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(source);
}

function lengthToken(value: Rational, unit: string, position: number): Token {
  return {
    type: "number",
    value: mul(value, rational(unitScale(unit))),
    kind: "length",
    position,
  };
}

function readNumber(source: string, at: number): { token: Token; end: number } {
  const mixed = matchAt(MIXED, source, at);
  if (mixed) {
    const unit = matchAt(UNIT, source, at + mixed[0].length);
    if (unit?.[1]) {
      const whole = BigInt(mixed[1] ?? "0");
      const num = BigInt(mixed[2] ?? "0");
      const den = BigInt(mixed[3] ?? "1");
      if (den === 0n) throw new ExpressionError("Fraction with a zero denominator", source, at);
      const value = rational(whole * den + num, den);
      return { token: lengthToken(value, unit[1], at), end: at + mixed[0].length + unit[0].length };
    }
  }

  const fraction = matchAt(FRACTION, source, at);
  if (fraction) {
    const unit = matchAt(UNIT, source, at + fraction[0].length);
    if (unit?.[1]) {
      const den = BigInt(fraction[2] ?? "1");
      if (den === 0n) throw new ExpressionError("Fraction with a zero denominator", source, at);
      const value = rational(BigInt(fraction[1] ?? "0"), den);
      return {
        token: lengthToken(value, unit[1], at),
        end: at + fraction[0].length + unit[0].length,
      };
    }
  }

  const decimal = matchAt(DECIMAL, source, at);
  if (!decimal) throw new ExpressionError("Expected a number", source, at);
  const fractionDigits = decimal[2] ?? "";
  const value = rational(
    BigInt(`${decimal[1]}${fractionDigits}`),
    10n ** BigInt(fractionDigits.length),
  );
  const end = at + decimal[0].length;
  const unit = matchAt(UNIT, source, end);
  if (unit?.[1]) return { token: lengthToken(value, unit[1], at), end: end + unit[0].length };
  const kind: Kind = fractionDigits.length > 0 ? "ratio" : "count";
  return { token: { type: "number", value, kind, position: at }, end };
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;

  while (at < source.length) {
    const ch = source.charAt(at);

    if (/\s/.test(ch)) {
      at += 1;
    } else if (/\d/.test(ch)) {
      const { token, end } = readNumber(source, at);
      tokens.push(token);
      at = end;
    } else if (IDENT_START.test(ch)) {
      let end = at + 1;
      while (end < source.length && IDENT_PART.test(source.charAt(end))) end += 1;
      tokens.push({ type: "ident", name: source.slice(at, end), position: at });
      at = end;
    } else if (ch === '"') {
      const close = source.indexOf('"', at + 1);
      if (close === -1) throw new ExpressionError("Unterminated quote", source, at);
      tokens.push({ type: "string", value: source.slice(at + 1, close), position: at });
      at = close + 1;
    } else if ("+-*/()[].,".includes(ch)) {
      tokens.push({ type: "op", op: ch as Extract<Token, { type: "op" }>["op"], position: at });
      at += 1;
    } else {
      throw new ExpressionError(`Unexpected character "${ch}"`, source, at);
    }
  }

  tokens.push({ type: "end", position: source.length });
  return tokens;
}
