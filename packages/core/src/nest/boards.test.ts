// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { INCH } from "../units";
import { packBoards } from "./boards";

const part = (name: string, length: number) => ({ instance: name, name, length: length * INCH });
const kerf = INCH / 8;
const trim = INCH / 2;

describe("packBoards", () => {
  it("opens the shortest standard length that holds the part", () => {
    const { boards } = packBoards([part("a", 60)], [96 * INCH, 72 * INCH, 120 * INCH], kerf, trim);
    expect(boards.map((b) => b.length)).toEqual([72 * INCH]);
  });

  it("fills a board first-fit decreasing, counting kerf and end trim", () => {
    // 96" board: 95" usable. 40 + 1/8 + 40 + 1/8 + 14-3/4 = 95 exactly.
    const items = [part("c", 14.75), part("a", 40), part("b", 40)];
    const { boards, tooLong } = packBoards(items, [96 * INCH], kerf, trim);
    expect(tooLong).toEqual([]);
    expect(boards).toHaveLength(1);
    expect(boards[0]?.items.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("starts a new board when the next part would not fit", () => {
    const { boards } = packBoards([part("a", 50), part("b", 50)], [96 * INCH], kerf, trim);
    expect(boards).toHaveLength(2);
  });

  it("returns parts longer than any board, without losing the rest", () => {
    const { boards, tooLong } = packBoards(
      [part("long", 120), part("ok", 10)],
      [96 * INCH],
      kerf,
      trim,
    );
    expect(tooLong.map((i) => i.name)).toEqual(["long"]);
    expect(boards.flatMap((b) => b.items.map((i) => i.name))).toEqual(["ok"]);
  });

  it("accounts for the trim: a part exactly the board length does not fit", () => {
    expect(packBoards([part("a", 96)], [96 * INCH], kerf, trim).tooLong).toHaveLength(1);
    expect(packBoards([part("a", 95)], [96 * INCH], kerf, trim).boards).toHaveLength(1);
  });
});
