// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a tool's change did that the user must be told: the boards it took over from the form and
// the first error it brought, from a full solve (assembly checks such as two boards in the same
// space only run there). Board and Join, which add, refuse a change that brings an error;
// Push/Pull, Move and Edge, which reshape or arrange, record it and say what it caused, in
// shop words: "Shelf 2 now overlaps Back; Undo puts it back." (ADR 015, rule 13).

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
import { boardsOf } from "../model/problem-boards";
import { followsForm, takenOver, takeOverNotice } from "../model/take-over";

/** A board the change took over and the engine renamed: its instance now, and before. */
export interface Renamed {
  now: Id;
  was: Id;
}

/**
 * The boards the change took over that now stand as instances of their own: a copy taken out of a
 * row gets a new instance, a part and a name ("Shelf 2" becomes "Shelf copy 2"), so its errors are
 * said in other words. Mapped back, an error it already had is not mistaken for a new one.
 */
function renamedBy(before: readonly PlacedPart[], next: Project): Renamed[] {
  return before.filter(followsForm).flatMap((b) => {
    const saved = instanceOf(next, b);
    return saved && saved.id !== b.instance ? [{ now: saved.id, was: b.instance }] : [];
  });
}

type Solved = Pick<SolveResult, "diagnostics" | "placements">;

/**
 * The first error in `after` that `before` did not have, or null. Errors are told apart by rule,
 * board and words, and counted, because the engine folds repeats of one message into one line
 * with a count: the same words a second time are still a new error.
 * An error on a board the change took over and `renamed` is said in new words, so it is compared
 * board by board instead: it is new unless that same board had an error of its rule before
 * (the take-over renames the board, so its old problem would otherwise look new).
 */
export function firstNewError(
  before: Solved,
  after: Solved,
  renamed: readonly Renamed[],
): Diagnostic | null {
  // A summary's words (per rule or per joint) carry how many problems are hidden, so they change
  // whenever that number does; it is left out and a change is judged by the problems listed (ADR
  // 015, limit 20).
  const errors = (list: readonly Diagnostic[]) =>
    list.filter((d) => d.severity === "error").filter((d) => !d.summary);
  const key = (d: Diagnostic): string => JSON.stringify([d.rule, d.part, d.message]);
  const known = new Map<string, number>();
  for (const d of errors(before.diagnostics))
    known.set(key(d), (known.get(key(d)) ?? 0) + (d.count ?? 1));
  /** True when board `was` had an error of `rule` before the change. */
  const hadOn = (rule: string, was: Id): boolean =>
    errors(before.diagnostics).some(
      (d) => d.rule === rule && boardsOf(d, before.placements).includes(was),
    );
  return (
    errors(after.diagnostics).find((d) => {
      const on = boardsOf(d, after.placements);
      const moved = renamed.filter((r) => on.includes(r.now));
      if (moved.length > 0) return moved.some((r) => !hadOn(d.rule, r.was));
      return (d.count ?? 1) > (known.get(key(d)) ?? 0);
    }) ?? null
  );
}

/** The first error `after` brings, from a full solve of each, with renamed boards mapped back. */
function brought(before: Project, after: Project, shop: ShopProfile) {
  const was = solve(before, shop);
  const now = solve(after, shop);
  const renamed = renamedBy(was.placements, after);
  return { was, now, error: firstNewError(was, now, renamed) };
}

/**
 * The first error `after` brings that `before` did not have, from a full solve of each, or null.
 * Messages are the engine's, in shop words, so a refusal can show them as they are.
 */
export function newProblem(before: Project, after: Project, shop: ShopProfile): string | null {
  return brought(before, after, shop).error?.message ?? null;
}

/**
 * What an error says the change caused, starting "<board> now …" (ADR 015, rule 13). The board named is
 * the one the change edited (`edited`, instances as they are now) when the error is about it.
 * Two boards in one space are both named; a joint's error names the board in the joint and the
 * one holding it, and says only that the joint has a problem unless the engine says which.
 */
function causedBy(error: Diagnostic, now: SolveResult, edited: readonly Id[]): string {
  const name = (id: Id): string => now.placements.find((p) => p.instance === id)?.name ?? "A board";
  const joint = error.joint && now.joints.find((j) => j.joint === error.joint);
  if (joint) {
    const kind = JOINT_NAME[joint.type];
    if (error.rule === "joint-overlap") return `${joint.guest} now overlaps ${joint.host}`;
    if (error.rule === "joint-no-contact")
      return `${joint.guest} now misses its ${kind} in ${joint.host}`;
    return `${joint.guest} now has a problem with its ${kind} in ${joint.host} (see Problems)`;
  }
  const boards = boardsOf(error, now.placements);
  const subject = boards.find((id) => edited.includes(id)) ?? boards[0];
  if (subject === undefined) return "The project now has a problem (see Problems)";
  const other = error.instances?.find((id) => id !== subject);
  if (error.rule === "overlap" && other !== undefined)
    return `${name(subject)} now overlaps ${name(other)}`;
  return `${name(subject)} now has a problem (see Problems)`;
}

/**
 * The notice for a change that reshapes or arranges boards (ADR 015, rule 13): the boards it took over
 * from the form, then what the change caused and that Undo puts it back. `edited` are the boards
 * the tool acted on, as instances in `after`, so the notice names them. Undefined when there is
 * nothing to tell.
 */
export function editNotice(
  before: Project,
  after: Project,
  shop: ShopProfile,
  edited: readonly Id[] = [],
): string | undefined {
  const { was, now, error } = brought(before, after, shop);
  const told = [
    takeOverNotice(takenOver(was.placements, after)),
    error === null ? undefined : `${causedBy(error, now, edited)}; Undo puts it back.`,
  ].filter((sentence) => sentence !== undefined);
  return told.length > 0 ? told.join(" ") : undefined;
}
