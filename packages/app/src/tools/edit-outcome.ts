// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool's change did that the user must be told: the boards it took over from the form and
// the first error it brought, from a full solve (assembly checks such as two boards in the same
// space only run there). Board and Join, which add, refuse a change that brings an error (ruling
// R36); Push/Pull, Move and Edge, which reshape or arrange, record it and say what it caused, in
// the ruling's words: "Shelf 2 now overlaps Back; Undo puts it back." (ruling R45).

import {
  type Diagnostic,
  type Id,
  JOINT_NAME,
  type PlacedPart,
  type Project,
  type ShopProfile,
  type SolveResult,
  solve,
} from "@kerf/core";
import { instanceOf } from "../model/commands";
import { followsForm, takenOver, takeOverNotice } from "../model/take-over";

/**
 * The part each board taken over by the change now has, mapped back to the part it had before.
 * Taking a copy out of a row gives it a part (and a name) of its own, so its errors are said in
 * other words; mapped back, an error it already had is not mistaken for a new one (re-review N4).
 */
function partsBefore(before: readonly PlacedPart[], after: SolveResult, next: Project) {
  const parts = new Map<Id, Id>();
  for (const b of before.filter(followsForm)) {
    const saved = instanceOf(next, b);
    const now = saved && after.placements.find((p) => p.instance === saved.id);
    if (now && now.part !== b.part) parts.set(now.part, b.part);
  }
  return parts;
}

/**
 * The first error in `after` that `before` did not have, or null. Errors are told apart by rule,
 * board and words, and counted, because the engine folds repeats of one message into one line
 * with a count: the same words a second time are still a new error (silent-failure review M12).
 * An error on a board the change took over and renamed (`renamed`: its part now → its part before)
 * is new only if that board had no error of the same rule before, since its words name it anew.
 */
function firstNewError(
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
  renamed: ReadonlyMap<Id, Id> = new Map(),
): Diagnostic | null {
  const errors = (list: readonly Diagnostic[]) => list.filter((d) => d.severity === "error");
  const key = (d: Diagnostic): string => JSON.stringify([d.rule, d.part, d.message]);
  const known = new Map<string, number>();
  for (const d of errors(before)) known.set(key(d), (known.get(key(d)) ?? 0) + (d.count ?? 1));
  const hadRule = (rule: string, part: Id): boolean =>
    errors(before).some((d) => d.rule === rule && d.part === part);
  return (
    errors(after).find((d) => {
      const was = d.part === undefined ? undefined : renamed.get(d.part);
      if (was !== undefined) return !hadRule(d.rule, was);
      return (d.count ?? 1) > (known.get(key(d)) ?? 0);
    }) ?? null
  );
}

/** The first error `after` brings, from a full solve of each, with the boards' parts mapped. */
function brought(before: Project, after: Project, shop: ShopProfile) {
  const was = solve(before, shop);
  const now = solve(after, shop);
  const renamed = partsBefore(was.placements, now, after);
  return { was, now, error: firstNewError(was.diagnostics, now.diagnostics, renamed) };
}

/**
 * The first error `after` brings that `before` did not have, from a full solve of each, or null.
 * Messages are the engine's, in shop words, so a refusal can show them as they are.
 */
export function newProblem(before: Project, after: Project, shop: ShopProfile): string | null {
  return brought(before, after, shop).error?.message ?? null;
}

/**
 * What an error says the change caused, starting "<board> now …" (ruling R45). A joint's error
 * names the board that sits in the joint and the one that holds it; any other names its board.
 */
function causedBy(error: Diagnostic, now: SolveResult): string {
  const joint = error.joint && now.joints.find((j) => j.joint === error.joint);
  if (joint) {
    if (error.rule === "joint-overlap") return `${joint.guest} now overlaps ${joint.host}`;
    const name = JOINT_NAME[joint.type];
    if (error.rule === "joint-no-contact")
      return `${joint.guest} now misses its ${name} in ${joint.host}`;
    return `${joint.guest} now does not fit its ${name} in ${joint.host}`;
  }
  const board = now.placements.find((p) => p.part === error.part);
  if (!board) return "The project now has a problem (see Problems)";
  if (error.rule === "overlap") return `${board.name} now runs into another board`;
  return `${board.name} now has a problem (see Problems)`;
}

/**
 * The notice for a change that reshapes or arranges boards (ruling R45): the boards it took over
 * from the form, then what the change caused and that Undo puts it back. Undefined when there is
 * nothing to tell.
 */
export function editNotice(before: Project, after: Project, shop: ShopProfile): string | undefined {
  const { was, now, error } = brought(before, after, shop);
  const told = [
    takeOverNotice(takenOver(was.placements, after)),
    error === null ? undefined : `${causedBy(error, now)}; Undo puts it back.`,
  ].filter((sentence) => sentence !== undefined);
  return told.length > 0 ? told.join(" ") : undefined;
}
