// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Core flow step 5: "select the shelves → 1/8" roundover on both front edges". Operation specs:
// shelves get a 1/8" roundover on edge1/face0 and edge1/face1. ADR 015, D3.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { detachForEdit, startProject } from "../model/commands";
import { newId } from "../model/ids";
import { BOTH_FRONT_EDGES, edgeName, roundEdges } from "./edge";

const shop = loadShopProfile();
const IN = 203_200;
const bookcase = () => startProject("Bookcase", "imperial").project;
const named = (name: string) =>
  solve(bookcase(), shop).placements.filter((p) => p.partName === name);

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

  it("names the edges in shop words", () => {
    expect(edgeName("edge1/face1")).toBe("Front edge, show face");
    expect(edgeName("edge0/face0")).toBe("Back edge, inside face");
    expect(edgeName("end0/face1")).toBe("First end, show face");
  });
});
