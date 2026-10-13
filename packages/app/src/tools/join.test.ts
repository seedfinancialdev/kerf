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
import { acceptProposal, joinTool, propose } from "./join";
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
    expect(r).toEqual({ ok: false, message: "Two dados on Right side overlap." });
  });
});

describe("taking over form boards", () => {
  const form = () => startProject("Bookcase", "imperial").project;

  it("detaches both boards of a row copy and a single board, then joins them", () => {
    const p = form();
    const r = acceptProposal(p, shop, placed(p, "Shelf 1"), placed(p, "Back"), "dado");
    if (!r.ok) throw new Error(r.message);
    expect(r.edit.label).toBe("Joined Shelf 1 to Back with a dado");
    const after = solve(r.edit.project, shop).placements;
    expect(after.find((x) => x.name === "Shelf copy 1")?.detached).toBe(true);
    expect(after.find((x) => x.name === "Back")?.detached).toBe(true);
    expect(after.find((x) => x.name === "Shelf 2")?.detached).toBe(false);
  });

  it("says why, and does not throw, when a board cannot be taken over", () => {
    const p = form();
    const gone = { ...placed(p, "Right side"), part: "no-such-part" };
    const r = acceptProposal(p, shop, gone, placed(p, "Shelf 1"), "dado");
    expect(r).toEqual({ ok: false, message: 'The project has no part "no-such-part".' });
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
