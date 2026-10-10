// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solid stock: 1D length packing against standard board lengths (Cut list & nesting, "Inputs").
// Rough size is cut size plus the stock allowance; every board loses its end trim and a kerf
// separates neighbouring parts.

import type { Id, Len } from "../types";

export interface BoardItem {
  instance: Id;
  name: string;
  /** Rough length: cut length plus the stock's length allowance. */
  length: Len;
}

export interface PackedBoard {
  length: Len;
  items: BoardItem[];
}

/** Space a board still has, after trim and the parts already on it. */
function room(board: PackedBoard, used: Len, trim: Len): Len {
  return board.length - 2 * trim - used;
}

type Strategy = "shortest" | "longest";

function packWith(
  ordered: BoardItem[],
  lengths: Len[],
  kerf: Len,
  trim: Len,
  strategy: Strategy,
): { boards: PackedBoard[]; tooLong: BoardItem[] } {
  const boards: PackedBoard[] = [];
  const used: Len[] = [];
  const tooLong: BoardItem[] = [];

  for (const item of ordered) {
    let placed = false;
    for (const [i, board] of boards.entries()) {
      const needed = board.items.length === 0 ? item.length : kerf + item.length;
      if (needed <= room(board, used[i] ?? 0, trim)) {
        board.items.push(item);
        used[i] = (used[i] ?? 0) + needed;
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const holding = lengths.filter((l) => item.length <= l - 2 * trim);
    const length = strategy === "shortest" ? holding[0] : holding.at(-1);
    if (length === undefined) {
      tooLong.push(item);
      continue;
    }
    boards.push({ length, items: [item] });
    used.push(item.length);
  }

  // Buy no more length than each board's parts need.
  for (const [i, board] of boards.entries()) {
    const shorter = lengths.find((l) => (used[i] ?? 0) <= l - 2 * trim);
    if (shorter !== undefined && shorter < board.length) board.length = shorter;
  }
  return { boards, tooLong };
}

/**
 * First-fit decreasing, tried two ways: every new board the shortest length that holds its first
 * part, or the longest standard length (then shrunk to what its parts need). Fewest boards wins,
 * then least length bought; ties go to the first. Returns the parts no standard length can hold.
 */
export function packBoards(
  items: BoardItem[],
  standardLengths: Len[],
  kerf: Len,
  trim: Len,
): { boards: PackedBoard[]; tooLong: BoardItem[] } {
  const lengths = [...standardLengths].sort((a, b) => a - b);
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.length - a.item.length || a.index - b.index)
    .map(({ item }) => item);

  const total = (r: { boards: PackedBoard[] }): number =>
    r.boards.reduce((sum, b) => sum + b.length, 0);
  const candidates = (["shortest", "longest"] as const).map((s) =>
    packWith(ordered, lengths, kerf, trim, s),
  );
  return candidates.reduce((best, c) =>
    c.boards.length < best.boards.length ||
    (c.boards.length === best.boards.length && total(c) < total(best))
      ? c
      : best,
  );
}
