// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool's change did that the user must be told: the boards it took over from the form and
// the first error it brought, from a full solve (assembly checks such as two boards in the same
// space only run there). Board and Join, which add, refuse a change that brings an error (ruling
// R36); Push/Pull, Move and Edge, which reshape or arrange, record it and name it with Undo
// (ruling R45).

import { type Diagnostic, type Project, type ShopProfile, solve } from "@kerf/core";
import { takenOver, takeOverNotice } from "../model/take-over";

/**
 * The first error in `after` that `before` did not have, or null. Errors are told apart by rule,
 * board and words, and counted, because the engine folds repeats of one message into one line
 * with a count: the same words a second time are still a new error (silent-failure review M12).
 */
export function firstNewError(
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
): string | null {
  const key = (d: Diagnostic): string => JSON.stringify([d.rule, d.part, d.message]);
  const known = new Map<string, number>();
  for (const d of before) {
    if (d.severity === "error") known.set(key(d), (known.get(key(d)) ?? 0) + (d.count ?? 1));
  }
  const brought = after.find(
    (d) => d.severity === "error" && (d.count ?? 1) > (known.get(key(d)) ?? 0),
  );
  return brought?.message ?? null;
}

/**
 * The first error `after` brings that `before` did not have, from a full solve of each, or null.
 * Messages are the engine's, in shop words, so they can be shown as they are.
 */
export function newProblem(before: Project, after: Project, shop: ShopProfile): string | null {
  return firstNewError(solve(before, shop).diagnostics, solve(after, shop).diagnostics);
}

/**
 * The notice for a change that reshapes or arranges boards (ruling R45): the boards it took over
 * from the form, then the first error it brought and that Undo puts it back. Undefined when there
 * is nothing to tell.
 */
export function editNotice(before: Project, after: Project, shop: ShopProfile): string | undefined {
  const was = solve(before, shop);
  const problem = firstNewError(was.diagnostics, solve(after, shop).diagnostics);
  const told = [
    takeOverNotice(takenOver(was.placements, after)),
    problem === null ? undefined : `${problem} Undo puts it back.`,
  ].filter((sentence) => sentence !== undefined);
  return told.length > 0 ? told.join(" ") : undefined;
}
