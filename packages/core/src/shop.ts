// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Shop profile validation (Domain model v0, `ShopProfile`). It arrives from a settings file or a
// UI, so it is checked like any other input rather than trusted.

import { MAX_LENGTH } from "./length";
import type { Diagnostic } from "./outputs";
import type { ShopProfile } from "./types";

const isLength = (v: unknown, min: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= MAX_LENGTH;

function problem(message: string): Diagnostic {
  return {
    severity: "error",
    rule: "invalid-shop",
    message: `The shop profile is not valid: ${message}.`,
    field: "shop profile",
  };
}

/** Returns a diagnostic describing the first problem, or null when the profile is usable. */
export function shopProblem(shop: unknown): Diagnostic | null {
  if (typeof shop !== "object" || shop === null) return problem("it is missing");
  const { kerf, tools } = shop as { kerf?: unknown; tools?: unknown };
  if (!isLength(kerf, 0))
    return problem("the saw kerf must be a whole number of units, zero or more");
  if (!Array.isArray(tools)) return problem("the list of tools is missing");

  for (const [i, tool] of tools.entries()) {
    if (typeof tool !== "object" || tool === null) return problem(`tool ${i + 1} is not an object`);
    const t = tool as Record<string, unknown>;
    if (t.type === "dadoStack") {
      if (!isLength(t.maxWidth, 1))
        return problem(`the dado stack (tool ${i + 1}) needs a maximum width`);
    } else if (t.type === "router") {
      const sizes = (v: unknown): boolean => Array.isArray(v) && v.every((n) => isLength(n, 1));
      if (!sizes(t.straightBits) || !sizes(t.roundoverBits)) {
        return problem(
          `the router (tool ${i + 1}) needs lists of straight and roundover bit sizes`,
        );
      }
    } else if (t.type === "handTools") {
      if (typeof t.dovetails !== "boolean")
        return problem(`the hand tools (tool ${i + 1}) need a dovetails setting`);
    } else {
      return problem(`tool ${i + 1} has an unknown type`);
    }
  }
  return null;
}

export type { ShopProfile };
