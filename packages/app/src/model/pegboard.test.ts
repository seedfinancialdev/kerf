// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, §1 "Your shop": the pegboard while it is being changed. A tool's settings appear once
// it is hung and are what the record keeps (ADR 016, D3); nothing else in the record is touched.

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import {
  addWood,
  hungCount,
  isHung,
  ownWood,
  recordOf,
  setSettings,
  toggleTool,
  toggleWood,
  wallFrom,
} from "./pegboard";
import { STARTER_RECORD } from "./shop-record";
import { STOCK_IDS } from "./starter";

const starterWall = () => wallFrom(STARTER_RECORD);

const MAPLE_ID = "01K7M4AP0000000000000000MA";

describe("the pegboard", () => {
  it("gives back the record it started from, unchanged but for setUp", () => {
    expect(recordOf(starterWall(), false)).toEqual(STARTER_RECORD);
    expect(recordOf(starterWall(), true)).toEqual({ ...STARTER_RECORD, setUp: true });
  });

  it("counts the five starter tools and three starter woods", () => {
    expect(hungCount(starterWall())).toBe(8);
  });

  it("hangs a tool that was not on the wall with its usual settings", () => {
    const wall = toggleTool(starterWall(), "trackSaw");
    expect(isHung(wall, "trackSaw")).toBe(true);
    // A standard blade: 1/8".
    expect(recordOf(wall, true).trackSaw).toEqual({ kerf: INCH / 8 });
  });

  it("takes a tool down and leaves the rest of the record alone", () => {
    const record = recordOf(toggleTool(starterWall(), "router"), true);
    expect(record).toEqual({ ...STARTER_RECORD, setUp: true, router: null });
  });

  it("keeps a tool's settings while it is down, so hanging it again brings them back", () => {
    let wall = setSettings(starterWall(), "dadoStack", { maxWidth: INCH / 2 });
    wall = toggleTool(toggleTool(wall, "dadoStack"), "dadoStack");
    expect(recordOf(wall, true).dadoStack).toEqual({ maxWidth: INCH / 2 });
  });

  it("toggles the tools that have no settings", () => {
    const wall = toggleTool(toggleTool(starterWall(), "drill"), "chisels");
    expect(recordOf(wall, true)).toMatchObject({ drill: true, chisels: false });
  });

  it("keeps a wood taken down on the wall, and out of the record", () => {
    const wall = toggleWood(starterWall(), STOCK_IDS.plywood14);
    expect(wall.wood).toEqual(STARTER_RECORD.stock);
    expect(recordOf(wall, true).stock.map((s) => s.id)).toEqual([
      STOCK_IDS.plywood34,
      STOCK_IDS.walnut44,
    ]);
    expect(hungCount(wall)).toBe(7);
  });

  it("hangs a wood of your own after the others", () => {
    const maple = ownWood(MAPLE_ID, "8/4 maple", "board", (7 * INCH) / 4);
    const wall = addWood(starterWall(), maple);
    expect(recordOf(wall, true).stock.at(-1)?.name).toBe("8/4 maple");
    expect(hungCount(wall)).toBe(9);
  });

  it("makes a wood of your own in sheets the size of the starter plywood", () => {
    expect(ownWood(MAPLE_ID, "Baltic birch", "sheet", (3 * INCH) / 4)).toEqual({
      ...STARTER_RECORD.stock[0],
      id: MAPLE_ID,
      name: "Baltic birch",
      thickness: (3 * INCH) / 4,
    });
  });

  it("makes a wood of your own in boards the size of the starter walnut", () => {
    expect(ownWood(MAPLE_ID, "8/4 maple", "board", (7 * INCH) / 4)).toEqual({
      ...STARTER_RECORD.stock[2],
      id: MAPLE_ID,
      name: "8/4 maple",
      thickness: (7 * INCH) / 4,
    });
  });
});
