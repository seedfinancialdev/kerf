// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The check behind every tool that adds to the project (ruling R36): a change is refused when the
// full solve finds an error the project did not already have.

import { type Project, type ShopProfile, solve } from "@kerf/core";

/**
 * The first error `after` brings that `before` did not have, from a full solve (assembly checks
 * such as two boards in the same space only run there), or null. Messages are the engine's, in
 * shop words, so they can be shown as they are.
 */
export function newProblem(before: Project, after: Project, shop: ShopProfile): string | null {
  const errors = (p: Project): string[] =>
    solve(p, shop)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.message);
  const known = new Set(errors(before));
  return errors(after).find((m) => !known.has(m)) ?? null;
}
