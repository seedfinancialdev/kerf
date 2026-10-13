// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Join: Click two touching parts; the joint is proposed from the contact and the
// shop profile". Default dado depth for 23/32" stock: 15/64" (Task 6's hand calculation).

import { type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { bookcaseWithShelf } from "../testing/bookcase-with-shelf";
import { memoryStorage } from "../testing/memory-storage";
import { drawBoard } from "./board";
import { acceptProposal, joinTool, propose, takeOverNotice } from "./join";
import type { ModelHit } from "./pointer";

const shop = loadShopProfile();
const placed = (p: Project, name: string) => {
  const found = solve(p, shop).placements.find((x) => x.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe("Join", () => {
  it("proposes a dado for the new shelf in the right side", () => {
    const p = bookcaseWithShelf();
    const r = propose(p, shop, placed(p, "Right side"), placed(p, "Board 1"));
    expect(r.result).toMatchObject({ ok: true, joint: { type: "dado" } });
  });

  it('accepting adds the joint: a 15/64"-deep dado setup appears', () => {
    const p = bookcaseWithShelf();
    const r = acceptProposal(p, shop, placed(p, "Right side"), placed(p, "Board 1"), "dado");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Joined Board 1 to Right side with a dado");
    const depths = solve(r.edit.project, shop).setups.flatMap((s) =>
      s.depth === undefined ? [] : [s.depth],
    );
    expect(depths).toContain(47_625);
  });

  it("refuses two boards that do not touch, with the engine's reason", () => {
    const p = bookcaseWithShelf();
    const r = acceptProposal(p, shop, placed(p, "Top"), placed(p, "Board 1"), "dado");
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses a joint that brings a new error: the same dado twice cut two overlapping dados", () => {
    const p = bookcaseWithShelf();
    const first = acceptProposal(p, shop, placed(p, "Right side"), placed(p, "Board 1"), "dado");
    if (!first.ok) throw new Error(first.message);
    const again = first.edit.project;
    const r = acceptProposal(
      again,
      shop,
      placed(again, "Right side"),
      placed(again, "Board 1"),
      "dado",
    );
    expect(r).toEqual({ ok: false, message: "Right side and Board 1 are already joined." });
  });

  it("never prints undefined in the label when the board has no name of its own", () => {
    const p = bookcaseWithShelf();
    const unnamed = {
      ...p,
      instances: p.instances.map((i) => (i.name === "Board 1" ? { ...i, name: undefined } : i)),
    };
    const shelf = solve(unnamed, shop).placements.find(
      (x) => x.instance === p.instances.find((i) => i.name === "Board 1")?.id,
    );
    if (!shelf) throw new Error("no unnamed board");
    const r = acceptProposal(unnamed, shop, placed(unnamed, "Right side"), shelf, "dado");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe(`Joined ${shelf.name} to Right side with a dado`);
  });
});

describe("taking over form boards", () => {
  const form = () => startProject("Bookcase", "imperial").project;
  /** The form's project with "Board 1", a 3/4" shelf drawn by hand between the sides at 36". */
  const withDrawnBoard = (p: Project): Project => {
    const ply = p.stock.find((st) => st.name === "3/4 plywood")?.id ?? "";
    return drawBoard(
      p,
      ply,
      [146_050, 50_800, 36 * 203_200],
      { axis: 0, size: 7_023_100 },
      { axis: 1, size: 11 * 203_200 },
    ).project;
  };

  it("takes over a form side and joins a hand-drawn board to it", () => {
    const p = withDrawnBoard(form());
    const r = acceptProposal(p, shop, placed(p, "Right side"), placed(p, "Board 1"), "dado");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Joined Board 1 to Right side with a dado");
    expect(r.notice).toBe("Right side is now custom; the form won't change it.");
    const after = solve(r.edit.project, shop).placements;
    expect(after.find((x) => x.name === "Right side")?.detached).toBe(true);
    expect(after.find((x) => x.name === "Board 1")?.detached).toBe(false);
  });

  it("joins a hand-drawn divider to a row shelf: the copy is taken out, detached and joined", () => {
    // Shelf 2 spans x 146050..7169150, y 50800..2438400 and its top face is z = 5940425. A divider
    // of the same 3/4" plywood, 2387600 deep (y) and 2032000 (10") tall (z), stands on that face with
    // its low corner at x = 3505200 (17-1/4"): z 5940425..7972425 clears Shelf 3 (from 8689975).
    const base = form();
    const ply = base.stock.find((st) => st.name === "3/4 plywood")?.id ?? "";
    const p = drawBoard(
      base,
      ply,
      [3_505_200, 50_800, 5_940_425],
      { axis: 1, size: 2_387_600 },
      { axis: 2, size: 2_032_000 },
    ).project;
    const r = acceptProposal(p, shop, placed(p, "Shelf 2"), placed(p, "Board 1"), "dado");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Joined Board 1 to Shelf copy 2 with a dado");
    expect(r.notice).toBe("Shelf 2 becomes Shelf copy 2, custom; the form won't change it.");
    const after = solve(r.edit.project, shop).placements;
    const copy = after.find((x) => x.name === "Shelf copy 2");
    expect(copy?.detached).toBe(true);
    expect(r.edit.project.joints).toContainEqual(
      expect.objectContaining({ type: "dado", host: copy?.instance }),
    );
  });

  it("refuses a form shelf and the back: the back is the thinner board", () => {
    // The Back is 1/4" plywood (50800 units), the shelf 3/4" (146050): no joint is cut into the Back.
    const p = form();
    const shelf = placed(p, "Shelf 1");
    const r = propose(p, shop, shelf, placed(p, "Back"));
    expect(r).toMatchObject({
      a: shelf.instance,
      result: {
        ok: false,
        reason:
          "Back is thinner than Shelf 1, so Kerf won't cut a joint into it; glue or nail it in place.",
      },
    });
  });

  it("lists the boards Accept will take over, with the name each will have", () => {
    const p = form();
    const r = propose(p, shop, placed(p, "Shelf 2"), placed(p, "Back"));
    expect(r.taken).toEqual([
      { from: "Shelf 2", to: "Shelf copy 2" },
      { from: "Back", to: "Back" },
    ]);
  });

  it("refuses a form shelf and a board it does not touch, with the engine's reason", () => {
    const p = form();
    const r = propose(p, shop, placed(p, "Shelf 1"), placed(p, "Top"));
    expect(r.result).toEqual({
      ok: false,
      reason: "Shelf 1 and Top do not touch, so there is nothing to join.",
    });
  });

  it("says a form shelf and the side that already holds it in a dado are already joined", () => {
    const p = form();
    const r = propose(p, shop, placed(p, "Shelf 1"), placed(p, "Right side"));
    expect(r.result).toEqual({
      ok: false,
      reason: "Shelf 1 and Right side are already joined.",
    });
  });

  it("says why, and does not throw, when a board cannot be taken over", () => {
    const p = form();
    const gone = { ...placed(p, "Right side"), part: "no-such-part" };
    const r = acceptProposal(p, shop, gone, placed(p, "Shelf 1"), "dado");
    expect(r).toEqual({
      ok: false,
      message: "That board is no longer in the project; click it again.",
    });
  });
});

describe("the Join tool", () => {
  const started = () => {
    const s = createKerfStore({ storage: createStorage(memoryStorage()) });
    s.getState().begin({ label: "Start", project: bookcaseWithShelf() });
    s.getState().setTool("join");
    return s;
  };
  const click = (s: ReturnType<typeof started>, name: string) => {
    const project = s.getState().history?.entries[0]?.project as Project;
    const hit: ModelHit = { placed: placed(project, name), point: [0, 0, 0], normal: [1, 0, 0] };
    joinTool.pointer?.({ kind: "down", hit, ray: null, shift: false, ctrl: false }, s);
  };

  it("remembers the first board and asks for the second", () => {
    const s = started();
    expect(joinTool.prompt?.(s.getState())).toBe("Click the first board");
    click(s, "Right side");
    expect(s.getState().pending).toMatchObject({ tool: "join" });
    expect(joinTool.prompt?.(s.getState())).toBe("Click the second board");
  });

  it("proposes a dado after the second board and changes nothing", () => {
    const s = started();
    click(s, "Right side");
    click(s, "Board 1");
    expect(s.getState().proposal?.result).toMatchObject({ ok: true, joint: { type: "dado" } });
    expect(s.getState().pending).toBeNull();
    expect(s.getState().history?.entries).toHaveLength(1);
  });

  it("starts again when the same board is clicked twice", () => {
    const s = started();
    click(s, "Right side");
    click(s, "Right side");
    expect(s.getState().proposal).toBeNull();
    expect(s.getState().pending).toMatchObject({ tool: "join" });
  });

  it("gives the engine's reason for boards that do not touch", () => {
    const s = started();
    click(s, "Top");
    click(s, "Board 1");
    expect(s.getState().proposal?.result).toEqual({
      ok: false,
      reason: "Top and Board 1 do not touch, so there is nothing to join.",
    });
  });
});

describe("takeOverNotice()", () => {
  it("is nothing when no board was taken over", () => {
    expect(takeOverNotice([])).toBeUndefined();
  });

  it("names one board that kept its name", () => {
    expect(takeOverNotice([{ from: "Top", to: "Top" }])).toBe(
      "Top is now custom; the form won't change it.",
    );
  });

  it("says when one board's name changes", () => {
    expect(takeOverNotice([{ from: "Shelf 1", to: "Shelf copy 1" }])).toBe(
      "Shelf 1 becomes Shelf copy 1, custom; the form won't change it.",
    );
  });

  it("names two boards, showing a changed name", () => {
    expect(
      takeOverNotice([
        { from: "Shelf 1", to: "Shelf copy 1" },
        { from: "Back", to: "Back" },
      ]),
    ).toBe("Shelf 1 (now Shelf copy 1) and Back are now custom; the form won't change them.");
  });
});
