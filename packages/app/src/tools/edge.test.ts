// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Core flow step 5: "select the shelves → 1/8" roundover on both front edges". Operation specs:
// shelves get a 1/8" roundover on edge1/face0 and edge1/face1. ADR 015, D3.

import { type EdgeRef, type PlacedPart, type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { addRoundover, detachForEdit, setShelves, startProject } from "../model/commands";
import { newId } from "../model/ids";
import { BOTH_FRONT_EDGES, roundEdges as tryRoundEdges } from "./edge";

const shop = loadShopProfile();
const IN = 203_200;
const bookcase = () => startProject("Bookcase", "imperial").project;
const named = (name: string) =>
  solve(bookcase(), shop).placements.filter((p) => p.partName === name);

/** The change a pick of boards is expected to make; fails the test with the refusal otherwise. */
function roundEdges(
  project: Project,
  placed: PlacedPart[],
  edges: EdgeRef[],
  radius: number | null,
  forShop: typeof shop,
) {
  const r = tryRoundEdges(project, placed, edges, radius, forShop);
  if (!r.ok) throw new Error(r.message);
  return r.edit;
}

const handTop = (p: Project) => solve(p, shop).placements.filter((x) => x.partName === "Top");
const top = (p: Project = bookcase()): PlacedPart => {
  const [found] = handTop(p);
  if (!found) throw new Error("the bookcase has no top");
  return found;
};

describe("roundEdges()", () => {
  it("sets the form's shelf roundover when all the form's shelves are picked, so they keep resizing", () => {
    const { project, label } = roundEdges(
      bookcase(),
      named("Shelf"),
      BOTH_FRONT_EDGES,
      IN / 8,
      shop,
    );
    expect(label).toBe('Shelf roundover 1/8"');
    expect(project.parts).toEqual([]);
  });

  it("gives one router setup of 8 edges for the four shelves", () => {
    // 4 shelves × 2 front edges = 8 (Operation specs; Interaction spec, "Edge profiles by bit").
    const { project } = roundEdges(bookcase(), named("Shelf"), BOTH_FRONT_EDGES, IN / 8, shop);
    const profile = solve(project, shop).setups.find((s) => s.bit?.type === "roundover");
    expect(profile?.cuts).toBe(8);
  });

  it("says why, without throwing, when a picked copy is no longer in its row (silent-failure review M3)", () => {
    // Shelf 4 is picked, then the row drops to two shelves: there is no copy 4 to take over.
    const shelf4 = named("Shelf")[3];
    const p = bookcase();
    const structure = p.structures[0];
    if (!shelf4 || !structure) throw new Error("no fourth shelf");
    const fewer = setShelves(p, structure.id, structure.openings[0]?.id ?? "", "2", "even");
    if (!fewer.ok) throw new Error(fewer.message);
    expect(tryRoundEdges(fewer.edit.project, [shelf4], ["edge0/face1"], IN / 8, shop)).toEqual({
      ok: false,
      message: 'There is no copy 4 of "Shelf" to detach.',
    });
  });

  it("takes over a board the form made that is not a shelf, and rounds it", () => {
    const { project, label } = roundEdges(bookcase(), named("Top"), BOTH_FRONT_EDGES, IN / 8, shop);
    expect(label).toBe('Roundover 1/8" on Top');
    expect(project.parts.find((d) => d.name === "Top")?.detached).toBe(true);
  });

  it("rounds two copies of one board once, on the board they share", () => {
    const [top] = named("Top");
    if (!top) throw new Error("no top");
    const taken = detachForEdit(bookcase(), top, shop).project;
    const original = taken.instances.find((i) => i.def === top.part);
    if (!original) throw new Error("no top instance");
    const twoTops = { ...taken, instances: [...taken.instances, { ...original, id: newId() }] };
    const copies = solve(twoTops, shop).placements.filter((p) => p.part === top.part);
    expect(copies).toHaveLength(2);
    const { project, label } = roundEdges(twoTops, copies, BOTH_FRONT_EDGES, IN / 8, shop);
    expect(label).toBe('Roundover 1/8" on 2 boards');
    expect(
      project.parts.find((d) => d.id === top.part)?.ops.filter((o) => o.type === "roundover"),
    ).toHaveLength(1);
  });

  it("keeps the form's shelf roundover when shelves are picked with another board", () => {
    // A mixed pick is not "the form's shelves": each board carries the roundover itself.
    const before = bookcase();
    const pick = [...named("Shelf"), ...named("Top")];
    const { project } = roundEdges(before, pick, BOTH_FRONT_EDGES, IN / 4, shop);
    expect(project.structures[0]?.options.shelfRoundover).toBe(
      before.structures[0]?.options.shelfRoundover,
    );
    const rounded = project.parts.filter((d) =>
      d.ops.some((op) => op.type === "roundover" && op.radius === "6.35mm"),
    );
    // Four shelves taken out of their row one by one, and the top.
    expect(rounded).toHaveLength(5);
  });

  it("rounds a shelf taken out of the form on the shelf itself, not on the form's shelf roundover", () => {
    // A detached shelf no longer follows the form, so its roundover is its own.
    const [shelf] = named("Shelf");
    if (!shelf) throw new Error("no shelf");
    const taken = detachForEdit(bookcase(), shelf, shop).project;
    const own = solve(taken, shop).placements.find((p) => p.detached);
    if (!own) throw new Error("the taken shelf is not detached");
    const before = taken.structures[0]?.options.shelfRoundover;
    const { project } = roundEdges(taken, [own], BOTH_FRONT_EDGES, IN / 4, shop);
    expect(project.structures[0]?.options.shelfRoundover).toBe(before);
    expect(
      project.parts.find((d) => d.id === own.part)?.ops.filter((o) => o.type === "roundover"),
    ).toHaveLength(1);
  });

  it("rounds every shelf picked, not only the last of the row", () => {
    // 4 shelves × 2 front edges the form made + 4 shelves × 1 back edge = 12 cuts.
    const { project } = roundEdges(bookcase(), named("Shelf"), ["edge0/face1"], IN / 8, shop);
    const profile = solve(project, shop).setups.find((s) => s.bit?.type === "roundover");
    expect(profile?.cuts).toBe(12);
  });

  it("replaces the roundover on an edge that has one, leaving one operation", () => {
    const once = addRoundover(bookcase(), top(), ["edge1/face1"], IN / 8, shop).project;
    const { project } = roundEdges(once, handTop(once), ["edge1/face1"], IN / 4, shop);
    expect(project.parts.find((d) => d.name === "Top")?.ops).toMatchObject([
      { type: "roundover", edges: ["edge1/face1"], radius: "6.35mm" },
    ]);
  });

  it("takes the roundover off only the chosen edges when the radius is None", () => {
    const front = addRoundover(bookcase(), top(), ["edge1/face1"], IN / 8, shop).project;
    const both = addRoundover(front, top(front), ["edge0/face1"], IN / 8, shop).project;
    const { project, label } = roundEdges(both, handTop(both), ["edge1/face1"], null, shop);
    expect(label).toBe("No roundover on Top");
    expect(project.parts.find((d) => d.name === "Top")?.ops).toMatchObject([
      { type: "roundover", edges: ["edge0/face1"] },
    ]);
  });

  it("clears the form's shelf roundover when None is chosen for its shelves' front edges", () => {
    const { project } = roundEdges(bookcase(), named("Shelf"), BOTH_FRONT_EDGES, null, shop);
    expect(project.structures[0]?.options.shelfRoundover).toBeUndefined();
  });

  it("says there is nothing to remove from a board that has no roundover", () => {
    const r = tryRoundEdges(bookcase(), named("Top"), BOTH_FRONT_EDGES, null, shop);
    expect(r).toEqual({ ok: false, message: "There's no roundover on those edges to remove." });
  });
});
