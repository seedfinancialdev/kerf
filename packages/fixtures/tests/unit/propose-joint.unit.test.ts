// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "3D tools": Join proposes the joint from the contact and the shop.
// Rules: ADR 015, rule 6. Defaults: Operation specs (dado depth = host thickness / 3 snapped down;
// rabbet depth = host thickness / 2 snapped down; width = guest thickness).

import {
  generateStructures,
  type Id,
  type Project,
  proposeJoint,
  type ShopProfile,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const JOINT = "01K7M3Q8ZD00000000T9000001";
const SHELF = "01K7M3Q8ZD00000000T9000002";

/** The bookcase's boards as hand-made boards with no joints, plus one loose shelf at 36". */
function looseBoards(): Project {
  const form = loadProject("bookcase", "structure");
  const structure = form.structures[0];
  if (!structure) throw new Error("no structure");
  structure.openings = [{ id: structure.openings[0]?.id ?? "", children: [] }];
  const g = generateStructures(form, shop);
  const instances = g.instances.map(({ generatedBy: _, ...i }) => i);
  const top = instances.find((i) => i.name === "Top");
  if (!top) throw new Error("no top");
  instances.push({
    ...top,
    id: SHELF,
    name: "Loose shelf",
    position: { ...top.position, z: "36in" },
  });
  return {
    ...g,
    structures: [],
    joints: [],
    matchSets: [],
    patterns: [],
    parts: g.parts.map(({ source: _s, detached: _d, ...p }) => p),
    instances,
  };
}

const idOf = (p: Project, name: string): Id => {
  const found = p.instances.find((i) => i.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found.id;
};

describe("proposeJoint()", () => {
  it("proposes a dado for a shelf meeting the middle of a side, 15/64 deep", () => {
    // 23/32 ÷ 3 = 23/96" = 15.33/64 → snapped down to 15/64" = 47625 units.
    const p = looseBoards();
    const r = proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT);
    expect(r).toMatchObject({
      ok: true,
      joint: { type: "dado", host: idOf(p, "Right side"), guest: SHELF },
      tool: "dadoStack",
      missing: false,
    });
    if (r.ok)
      expect(r.description).toBe(
        'Loose shelf in a dado in Right side, 23/32" wide and 15/64" deep',
      );
  });

  it("proposes a rabbet for the top meeting the end of a side, 23/64 deep", () => {
    // 23/32 ÷ 2 = 23/64" exactly.
    const p = looseBoards();
    const r = proposeJoint(p, shop, idOf(p, "Top"), idOf(p, "Right side"), JOINT);
    expect(r).toMatchObject({
      ok: true,
      joint: { type: "rabbet", host: idOf(p, "Right side"), guest: idOf(p, "Top") },
    });
    if (r.ok)
      expect(r.description).toBe('Top in a rabbet in Right side, 23/32" wide and 23/64" deep');
  });

  it("says the tool is missing in a shop with no dado stack or straight bit", () => {
    const bare: ShopProfile = { kerf: 25_400, tools: [] };
    const p = looseBoards();
    expect(proposeJoint(p, bare, idOf(p, "Right side"), SHELF, JOINT)).toMatchObject({
      ok: true,
      missing: true,
    });
  });

  it("refuses two boards that do not touch, and says so", () => {
    const p = looseBoards();
    expect(proposeJoint(p, shop, idOf(p, "Top"), SHELF, JOINT)).toEqual({
      ok: false,
      reason: "Top and Loose shelf do not touch, so there is nothing to join.",
    });
  });

  it("refuses a board that is not in the project", () => {
    const p = looseBoards();
    expect(proposeJoint(p, shop, "01K7M3Q8ZD00000000T9000099", SHELF, JOINT)).toMatchObject({
      ok: false,
    });
  });

  it("tries a preferred type and refuses it with the engine's reason when it cannot seat", () => {
    // A shelf in the middle of a side cannot sit in a rabbet (ADR 013: a rabbet's guest lies
    // wholly inside the step at the host's end or edge).
    const p = looseBoards();
    const r = proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT, "rabbet");
    expect(r.ok).toBe(false);
  });

  it("does not change the project it is given", () => {
    const p = looseBoards();
    const before = JSON.stringify(p);
    proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT);
    expect(JSON.stringify(p)).toBe(before);
  });
});
