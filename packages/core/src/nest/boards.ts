// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solid stock: 1D length packing against standard board lengths (Cut list & nesting, "Inputs").
// Rough size is cut size plus the stock allowance; every board loses its end trim and a kerf
// separates neighbouring parts. A match set's composite blank is placed first, as a seed; the
// other parts then pack around it (Cut list & nesting, "Match sets").

import type { Id, Len } from "../types";

export interface BoardItem {
  instance: Id;
  name: string;
  /** Rough length: cut length plus the stock's length allowance. */
  length: Len;
}

/** A blank already decided on: a match set's composite, which needs a board at least this long. */
export interface BoardSeed {
  id: Id;
  /** Composite length, trim included. */
  minLength: Len;
}

export interface PackedBoard {
  length: Len;
  items: BoardItem[];
  /** The seeds (match-set composites) on this board, in the order they were placed. */
  seeds: Id[];
}

type Strategy = "shortest" | "longest";

interface Open {
  board: PackedBoard;
  /** Length used by parts and kerfs, excluding trim; the composites are included. */
  used: Len;
}

function packWith(
  ordered: BoardItem[],
  seeds: BoardSeed[],
  lengths: Len[],
  kerf: Len,
  trim: Len,
  strategy: Strategy,
): { boards: PackedBoard[]; tooLong: BoardItem[]; unplaced: BoardSeed[] } {
  const open: Open[] = [];
  const unplaced: BoardSeed[] = [];
  const tooLong: BoardItem[] = [];
  const choose = (holding: Len[]): Len | undefined =>
    strategy === "shortest" ? holding[0] : holding.at(-1);

  // Seeds go first, longest first, sharing boards where they fit. The composite already includes
  // its own trim, so it counts without adding trim again.
  const ranked = seeds
    .map((seed, index) => ({ seed, index }))
    .sort((x, y) => y.seed.minLength - x.seed.minLength || x.index - y.index)
    .map(({ seed }) => seed);
  for (const seed of ranked) {
    const size = seed.minLength - 2 * trim;
    const home = open.find(({ board, used }) => {
      const needed = used > 0 ? kerf + size : size;
      return needed <= board.length - 2 * trim - used;
    });
    if (home) {
      home.used += home.used > 0 ? kerf + size : size;
      home.board.seeds.push(seed.id);
      continue;
    }
    const length = choose(lengths.filter((l) => seed.minLength <= l));
    if (length === undefined) {
      unplaced.push(seed);
      continue;
    }
    open.push({ board: { length, items: [], seeds: [seed.id] }, used: size });
  }

  for (const item of ordered) {
    const home = open.find(({ board, used }) => {
      const needed = used > 0 ? kerf + item.length : item.length;
      return needed <= board.length - 2 * trim - used;
    });
    if (home) {
      home.board.items.push(item);
      home.used += home.used > 0 ? kerf + item.length : item.length;
      continue;
    }
    const length = choose(lengths.filter((l) => item.length <= l - 2 * trim));
    if (length === undefined) {
      tooLong.push(item);
      continue;
    }
    open.push({ board: { length, items: [item], seeds: [] }, used: item.length });
  }

  // Buy no more length than each board's contents need.
  for (const { board, used } of open) {
    const shorter = lengths.find((l) => used <= l - 2 * trim);
    if (shorter !== undefined && shorter < board.length) board.length = shorter;
  }
  return { boards: open.map((o) => o.board), tooLong, unplaced };
}

/**
 * First-fit decreasing, tried two ways: every new board the shortest length that holds its first
 * part, or the longest standard length (then shrunk to what its contents need). Fewest boards
 * wins, then least length bought; ties go to the first. Returns the parts no standard length can
 * hold and the seeds no board is long enough for.
 */
export function packBoards(
  items: BoardItem[],
  standardLengths: Len[],
  kerf: Len,
  trim: Len,
  seeds: BoardSeed[] = [],
): { boards: PackedBoard[]; tooLong: BoardItem[]; unplaced: BoardSeed[] } {
  const lengths = [...standardLengths].sort((a, b) => a - b);
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.length - a.item.length || a.index - b.index)
    .map(({ item }) => item);

  const total = (r: { boards: PackedBoard[] }): number =>
    r.boards.reduce((sum, b) => sum + b.length, 0);
  const candidates = (["shortest", "longest"] as const).map((s) =>
    packWith(ordered, seeds, lengths, kerf, trim, s),
  );
  return candidates.reduce((best, c) =>
    c.boards.length < best.boards.length ||
    (c.boards.length === best.boards.length && total(c) < total(best))
      ? c
      : best,
  );
}
