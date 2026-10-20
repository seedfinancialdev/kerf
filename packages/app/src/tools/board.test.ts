// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Board: Draw a board from stock; drawn between two parts, its length binds to
// the gap". Gap values: Operation specs (34-9/16" at 36", 28-9/16" at 30"). A click on the floor is
// placed with the sight-line arithmetic of drag.test.ts (scene (40, 10, 4), clear of the case,
// looking straight down, meets the floor at project (40", -4", 0)).

import { type Id, type PlacedPart, type Project, solve } from "@kerf/core";
import { loadShopProfile, withParam } from "@kerf/fixtures";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { describe, expect, it } from "vitest";
import { startProject, UNPLACEABLE } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { workshopStore } from "../testing/workshop-store";
import { boardBetween, boardTool, drawBoard } from "./board";
import type { ModelHit, ModelPointer } from "./pointer";

const shop = loadShopProfile();
const IN = 203_200;
const base = (): Project => handMadeBookcase();
const plywood = (p: Project): Id => p.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";
const placed = (p: Project, name: string): PlacedPart => {
  const found = solve(p, shop).placements.find((x) => x.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const instanceId = (p: Project, name: string): Id =>
  p.instances.find((i) => i.name === name)?.id ?? "";

describe("drawBoard()", () => {
  it("draws a 24 × 6 board of 3/4 plywood lying on the floor", () => {
    const p = base();
    const edit = drawBoard(
      p,
      plywood(p),
      [0, 0, 0],
      { axis: 0, size: 24 * IN },
      { axis: 1, size: 6 * IN },
    );
    expect(edit.label).toBe("Added Board 1");
    expect(placed(edit.project, "Board 1").box).toEqual({
      min: [0, 0, 0],
      max: [24 * IN, 6 * IN, 146_050],
    });
  });

  it("starts the board at the corner it is given", () => {
    const p = base();
    const edit = drawBoard(
      p,
      plywood(p),
      [40 * IN, -4 * IN, 0],
      { axis: 0, size: 24 * IN },
      { axis: 1, size: 6 * IN },
    );
    expect(placed(edit.project, "Board 1").box.min).toEqual([40 * IN, -4 * IN, 0]);
  });

  it("lays length along y and width along x when asked", () => {
    const p = base();
    const edit = drawBoard(
      p,
      plywood(p),
      [0, 0, 0],
      { axis: 1, size: 24 * IN },
      { axis: 0, size: 6 * IN },
    );
    const box = placed(edit.project, "Board 1").box;
    expect(box.max[1] - box.min[1]).toBe(24 * IN);
    expect(box.max[0] - box.min[0]).toBe(6 * IN);
  });

  it("names the next board Board 2 when Board 1 is taken, and says which board to pick", () => {
    const p = base();
    const one = drawBoard(
      p,
      plywood(p),
      [0, 0, 0],
      { axis: 0, size: 24 * IN },
      { axis: 1, size: 6 * IN },
    );
    const two = drawBoard(
      one.project,
      plywood(p),
      [0, 0, 0],
      { axis: 0, size: 12 * IN },
      { axis: 1, size: 6 * IN },
    );
    expect(two.label).toBe("Added Board 2");
    expect(two.project.instances.find((i) => i.id === two.picked)?.name).toBe("Board 2");
  });

  it.each([0, -IN])("refuses a size of %i", (size) => {
    const p = base();
    expect(() =>
      drawBoard(p, plywood(p), [0, 0, 0], { axis: 0, size }, { axis: 1, size: IN }),
    ).toThrow(RangeError);
  });

  it("refuses two sizes along the same axis", () => {
    const p = base();
    expect(() =>
      drawBoard(p, plywood(p), [0, 0, 0], { axis: 0, size: IN }, { axis: 0, size: IN }),
    ).toThrow(RangeError);
  });
});

describe("boardBetween()", () => {
  const between = (p: Project, width: number | null = 11 * IN) =>
    boardBetween(
      p,
      plywood(p),
      instanceId(p, "Right side"),
      instanceId(p, "Left side"),
      36 * IN,
      width,
      shop,
    );

  it("fits the gap between the sides: 34-9/16 at 36 wide", () => {
    const r = between(base());
    if (!r.ok) throw new Error(r.message);
    expect(placed(r.edit.project, "Board 1").size.length).toBe(7_023_100);
  });

  it("follows the width: 28-9/16 at 30 wide", () => {
    const r = between(base());
    if (!r.ok) throw new Error(r.message);
    const resized = withParam(r.edit.project, "width", "30in");
    expect(placed(resized, "Board 1").size.length).toBe(5_803_900);
  });

  it("lines the board up with the sides front to back and names both in its label", () => {
    const r = between(base());
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Added Board 1 between Right side and Left side");
    // Flush with the sides' fronts (ADR 015, rule 7): the sides are 12" deep (2438400), so 11" wide
    // starts 1" in.
    expect(placed(r.edit.project, "Board 1").box.min[1]).toBe(203_200);
  });

  it("sits at the height given and goes from one side's inner face to the other's", () => {
    const r = between(base());
    if (!r.ok) throw new Error(r.message);
    const box = placed(r.edit.project, "Board 1").box;
    // From the right side's inner face, 23/32" = 146050, to the left side's, 36" − 23/32" =
    // 7315200 − 146050 = 7169150; 1" in from the front (above) and 36" up, as typed.
    expect(box.min).toEqual([146_050, 203_200, 36 * IN]);
    expect(box.max[0]).toBe(7_169_150);
  });

  // Hand calculation (ADR 015, rule 7): the inset back is 1/4" (50800) thick against the rear edges
  // and spans the gap, so a board with no typed width reaches back to it. Its front is the sides'
  // front, 12" = 2438400. Depth = 2438400 - 50800 = 2387600.
  it("reaches back to the back panel and forward to the sides' fronts when no width is given", () => {
    const r = between(base(), null);
    if (!r.ok) throw new Error(r.message);
    const box = placed(r.edit.project, "Board 1").box;
    expect(box.min[1]).toBe(50_800);
    expect(box.max[1]).toBe(2_438_400);
  });

  it("builds without a problem in the hand-made bookcase", () => {
    const r = between(base(), null);
    if (!r.ok) throw new Error(r.message);
    const errors = solve(r.edit.project, shop).diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("refuses a width that would run into the back panel, in shop words", () => {
    const r = between(base(), 12 * IN);
    expect(r).toEqual({
      ok: false,
      message: `There is no room for a board that wide there; the most is 11-3/4".`,
    });
  });

  it("picks the new board", () => {
    const r = between(base());
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.project.instances.find((i) => i.id === r.picked)?.name).toBe("Board 1");
  });

  it.each([0, -IN])("refuses a width of %i", (width) => {
    expect(between(base(), width)).toEqual({
      ok: false,
      message: "A board needs a length and a width above zero.",
    });
  });

  it("refuses the form's two sides, in shop words, saying what to do instead", () => {
    // The user's decision (fix plan, 2026-10-13): no binding to boards a form made yet.
    const p = startProject("Bookcase", "imperial").project;
    const side = (name: string) => placed(p, name).instance;
    expect(
      boardBetween(p, plywood(p), side("Right side"), side("Left side"), 36 * IN, null, shop),
    ).toEqual({
      ok: false,
      message:
        "Boards the form made can't be measured between yet; use Divide to add shelves, or take a side over first.",
    });
  });

  it("says the boards cannot be placed, without throwing, when the engine rejects the project", () => {
    const p = startProject("Bookcase", "imperial").project;
    const [first, ...others] = p.stock;
    // A stock thinner than nothing is not a project the engine accepts (Domain model, "Stock").
    const broken = { ...p, stock: [{ ...first, thickness: -1 }, ...others] } as Project;
    expect(boardBetween(broken, plywood(p), "a", "b", 36 * IN, null, shop)).toEqual({
      ok: false,
      message: UNPLACEABLE,
    });
  });

  it("refuses a stock the project does not have instead of measuring with no thickness", () => {
    const p = base();
    const r = boardBetween(
      p,
      "01J9ZZZZZZZZZZZZZZZZZZZZZZ",
      instanceId(p, "Right side"),
      instanceId(p, "Left side"),
      36 * IN,
      null,
      shop,
    );
    expect(r).toEqual({ ok: false, message: "Add a stock to the project first." });
  });

  it("says why when the boards are one above the other", () => {
    const p = base();
    const r = boardBetween(
      p,
      plywood(p),
      instanceId(p, "Bottom"),
      instanceId(p, "Top"),
      0,
      11 * IN,
      shop,
    );
    expect(r).toEqual({
      ok: false,
      message:
        "A board between two boards one above the other is not supported yet; draw it on the lower board.",
    });
  });

  it("passes on the engine's reason when the boards do not face each other", () => {
    const p = base();
    const r = boardBetween(p, plywood(p), instanceId(p, "Right side"), "nope", 0, 11 * IN, shop);
    expect(r).toEqual({ ok: false, message: "Pick two boards to measure between." });
  });
});

describe("the Board tool", () => {
  const started = async (project: Project = base()) => {
    const s = await workshopStore({ label: "New project", project });
    s.getState().setTool("board");
    return s;
  };
  type Store = Awaited<ReturnType<typeof started>>;
  const event = (
    kind: ModelPointer["kind"],
    hit: ModelHit | null,
    ray: ModelPointer["ray"] = null,
  ): ModelPointer => ({
    kind,
    hit,
    ray,
    shift: false,
    ctrl: false,
  });
  const onSide = (s: Store, name: string, z = 36 * IN): ModelHit => {
    const project = s.getState().history?.entries[0]?.project as Project;
    return { placed: placed(project, name), point: [0, 0, z], normal: [1, 0, 0] };
  };
  const down = (s: Store, hit: ModelHit | null, ray: ModelPointer["ray"] = null) =>
    boardTool.pointer?.(event("down", hit, ray), s);
  const entries = (s: Store) => s.getState().history?.entries.length;
  const floorRay = { origin: [40, 10, 4], dir: [0, -1, 0] } as const;
  const current = (s: Store) => s.getState().history?.entries.at(-1)?.project as Project;

  it("starts a board where the sight line meets the floor", async () => {
    const s = await started();
    down(s, null, floorRay);
    // Straight down from scene (40, 10, 4) in, the line meets the floor (scene y = 0) at (40, 0,
    // 4). Scene (x, y, z) is project (x, −z, y) (scene/frames.ts), so project (40in, −4in, 0).
    expect(s.getState().pending).toEqual({
      tool: "board",
      from: { placed: null, point: [40 * IN, -4 * IN, 0] },
    });
  });

  it("starts nothing when the sight line looks above the floor, and says where to click", async () => {
    const s = await started();
    down(s, null, { origin: [3, 10, 4], dir: [0, 1, 0] });
    expect(s.getState().pending).toBeNull();
    expect(s.getState().notice?.text).toBe("Click a board, or the floor below the horizon.");
  });

  it("starts nothing when there is no sight line and no board", async () => {
    const s = await started();
    down(s, null);
    expect(s.getState().pending).toBeNull();
  });

  it("starts a board on the face of a board where it was clicked", async () => {
    const s = await started();
    const hit = onSide(s, "Top");
    down(s, hit);
    expect(s.getState().pending).toMatchObject({ tool: "board", from: { point: hit.point } });
  });

  it('draws the board typed as 24", 6" from the floor point, and picks it', async () => {
    const s = await started();
    down(s, null, floorRay);
    expect(boardTool.measure?.('24", 6"', s)).toBeNull();
    const board = placed(current(s), "Board 1");
    // From the floor point (40in, −4in, 0): 40 + 24 = 64in long, −4 + 6 = 2in wide, and as thick
    // as the 3/4 plywood, 23/32" = 146050.
    expect(board.box).toEqual({ min: [40 * IN, -4 * IN, 0], max: [64 * IN, 2 * IN, 146_050] });
    expect(s.getState().selection).toEqual({ kind: "boards", instances: [board.instance] });
    expect(s.getState().history?.entries.at(-1)?.label).toBe("Added Board 1");
    expect(s.getState().pending).toBeNull();
  });

  it("draws in the stock chosen for boards", async () => {
    const p = base();
    const thin = p.stock.find((x) => x.name === "1/4 plywood")?.id ?? "";
    const s = await started(p);
    s.getState().setBoardStock(thin);
    down(s, null, floorRay);
    boardTool.measure?.('24", 6"', s);
    expect(placed(current(s), "Board 1").size.thickness).toBe(IN / 4);
  });

  it("draws in the first sheet stock when none was chosen", async () => {
    const s = await started();
    down(s, null, floorRay);
    boardTool.measure?.('24", 6"', s);
    expect(placed(current(s), "Board 1").size.thickness).toBe(146_050);
  });

  it.each([
    ["a zero length", '0", 6"'],
    ["a negative width", '24", -6"'],
  ])("refuses %s and records nothing", async (_name, text) => {
    const s = await started();
    down(s, null, floorRay);
    const before = entries(s);
    expect(boardTool.measure?.(text, s)).toBe("A board needs a length and a width above zero.");
    expect(entries(s)).toBe(before);
    expect(s.getState().pending).not.toBeNull();
  });

  it.each([
    ["24", 'Type the length and width, like 24", 6".'],
    ['24, 6"', '"24" is not a length; add a unit (in, " or mm).'],
    ['abc, 6"', 'Unknown name "abc"'],
    ['24", 6", 3"', 'Type the length and width, like 24", 6".'],
    ['24"', 'Type the length and width, like 24", 6".'],
  ])("refuses %j, says why and records nothing", async (text, why) => {
    const s = await started();
    down(s, null, floorRay);
    const before = entries(s);
    expect(boardTool.measure?.(text, s)).toBe(why);
    expect(entries(s)).toBe(before);
  });

  it("asks for a starting point first when sizes are typed with none", async () => {
    const s = await started();
    expect(boardTool.measure?.('24", 6"', s)).toBe("Click where the board starts first.");
  });

  it("asks which project to draw in when there is none", () => {
    const s = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    expect(boardTool.measure?.('24", 6"', s)).toBe("Open a project from Home first.");
  });

  it("refuses a length beyond what a project allows (100000 inches)", async () => {
    const s = await started();
    down(s, null, floorRay);
    const before = entries(s);
    const message = boardTool.measure?.('100001", 6"', s);
    expect(message).toBe("Length is too large: the limit is 100,000 inches");
    expect(entries(s)).toBe(before);
  });

  it("refuses a board dropped into space another board holds, and records nothing", async () => {
    const s = await started();
    // The floor point (0, 0, 0) is inside the right side.
    boardTool.pointer?.(event("down", null, { origin: [0, 10, 0], dir: [0, -1, 0] }), s);
    const before = entries(s);
    const message = boardTool.measure?.('24", 6"', s);
    expect(message).toMatch(/occupy the same space/);
    expect(entries(s)).toBe(before);
    expect(s.getState().selection).toEqual({ kind: "none" });
  });

  it("fits a board between two boards clicked in turn, and picks it", async () => {
    const s = await started();
    down(s, onSide(s, "Right side"));
    down(s, onSide(s, "Left side", 0));
    const board = placed(current(s), "Board 1");
    expect(board.size.length).toBe(7_023_100);
    expect(board.box.min[2]).toBe(36 * IN);
    expect(s.getState().selection).toEqual({ kind: "boards", instances: [board.instance] });
    expect(s.getState().history?.entries.at(-1)?.label).toBe(
      "Added Board 1 between Right side and Left side",
    );
    expect(s.getState().pending).toBeNull();
  });

  it("tells the user, and records nothing, when both clicks are on the template's sides", async () => {
    const s = await started(startProject("Bookcase", "imperial").project);
    down(s, onSide(s, "Right side"));
    const before = entries(s);
    down(s, onSide(s, "Left side", 0));
    expect(s.getState().notice?.text).toBe(
      "Boards the form made can't be measured between yet; use Divide to add shelves, or take a side over first.",
    );
    expect(entries(s)).toBe(before);
  });

  it("says why when the two boards have no gap between them, and records nothing", async () => {
    const s = await started();
    down(s, onSide(s, "Bottom"));
    const before = entries(s);
    down(s, onSide(s, "Top"));
    expect(s.getState().notice?.text).toBe(
      "A board between two boards one above the other is not supported yet; draw it on the lower board.",
    );
    expect(entries(s)).toBe(before);
    expect(s.getState().pending).toBeNull();
  });

  it("starts again from the second click when it is on the same board", async () => {
    const s = await started();
    down(s, onSide(s, "Right side"));
    const again = onSide(s, "Right side", 10 * IN);
    down(s, again);
    expect(s.getState().pending).toMatchObject({ tool: "board", from: { point: again.point } });
  });

  it("ignores moves and releases", async () => {
    const s = await started();
    boardTool.pointer?.(event("move", onSide(s, "Top")), s);
    boardTool.pointer?.(event("up", onSide(s, "Top")), s);
    expect(s.getState().pending).toBeNull();
  });

  it("tells the user to add stock when the project has none", async () => {
    const s = await started({ ...base(), stock: [], parts: [], instances: [] });
    down(s, null, floorRay);
    expect(s.getState().notice?.text).toBe("Add a stock to the project first.");
    expect(s.getState().pending).toBeNull();
  });

  it("asks what to do next", async () => {
    const s = await started();
    expect(boardTool.prompt?.(s.getState())).toBe("Click a board or the floor");
    down(s, null, floorRay);
    expect(boardTool.prompt?.(s.getState())).toBe(
      'Length, width (e.g. 24", 6"), or click a second board',
    );
  });
});
