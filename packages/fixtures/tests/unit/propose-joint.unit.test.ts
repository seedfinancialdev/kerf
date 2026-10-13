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

  it("refuses to cut into the thinner board: Top and Back, in either click order", () => {
    // Back is 1/4 plywood (50800 units) and Top is 3/4 plywood (23/32" = 146050 units). The Back
    // is touched on its broad face, so it would host; 50800 < 146050, so the pair is refused.
    const p = looseBoards();
    for (const [first, second] of [
      ["Top", "Back"],
      ["Back", "Top"],
    ] as const) {
      expect(proposeJoint(p, shop, idOf(p, first), idOf(p, second), JOINT)).toEqual({
        ok: false,
        reason:
          "Back is thinner than Top, so Kerf won't cut a joint into it; glue or nail it in place.",
      });
    }
  });

  it("names an unnamed board by its part in the reason, never as undefined", () => {
    const p = looseBoards();
    const back = p.instances.find((i) => i.name === "Back");
    if (!back) throw new Error("fixture changed");
    delete back.name;
    expect(proposeJoint(p, shop, idOf(p, "Top"), back.id, JOINT)).toEqual({
      ok: false,
      reason:
        "Back is thinner than Top, so Kerf won't cut a joint into it; glue or nail it in place.",
    });
  });

  it("still proposes a dado when a thin board meets the middle of a thick board's face", () => {
    // A 1/4" board (50800 units) 36" up the 23/32" Right side: the thin guest sits in the thick
    // host, so the thickness rule allows it. The dado is as wide as the guest, 50800 units.
    const p = looseBoards();
    const top = p.parts.find((part) => part.name === "Top");
    const quarter = p.stock.find((st) => st.name === "1/4 plywood");
    const loose = p.instances.find((i) => i.id === SHELF);
    if (!top || !quarter || !loose) throw new Error("fixture changed");
    const thin = {
      ...top,
      id: "01K7M3Q8ZD00000000T9000005",
      name: "Thin shelf",
      stock: quarter.id,
    };
    p.parts.push(thin);
    loose.def = thin.id;
    expect(proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT)).toMatchObject({
      ok: true,
      joint: { type: "dado", host: idOf(p, "Right side"), guest: SHELF },
    });
  });

  it("refuses a dado in the Back too, when asked for the other type", () => {
    const p = looseBoards();
    expect(proposeJoint(p, shop, idOf(p, "Top"), idOf(p, "Back"), JOINT, "dado")).toMatchObject({
      ok: false,
    });
  });

  it('refuses a loose shelf against the Back (23/32" shelf, 1/4" back)', () => {
    const p = looseBoards();
    const back = p.instances.find((i) => i.name === "Back");
    const shelf = p.instances.find((i) => i.id === SHELF);
    if (!back || !shelf) throw new Error("fixture changed");
    // The loose shelf lies at 36", spanning the sides; the Back is behind it, touching its rear edge.
    expect(proposeJoint(p, shop, SHELF, back.id, JOINT)).toEqual({
      ok: false,
      reason:
        "Back is thinner than Loose shelf, so Kerf won't cut a joint into it; glue or nail it in place.",
    });
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
    expect(r).toEqual({
      ok: false,
      reason:
        "Loose shelf is not seated against the rabbet in Right side: it does not sit in a step against an end or edge.",
    });
  });

  it("refuses through dovetails for boards that only touch, with the engine's reason", () => {
    const p = looseBoards();
    const r = proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT, "throughDovetail");
    expect(r).toEqual({
      ok: false,
      reason:
        "Loose shelf and Right side do not meet at a right-angle corner, so they cannot be dovetailed.",
    });
  });

  it("offers a preferred type that seats, in place of the contact rule's choice", () => {
    // The top at the end of a side is a rabbet by contact; a dado of 23/32 ÷ 3 = 15/64" also seats.
    const p = looseBoards();
    const r = proposeJoint(p, shop, idOf(p, "Top"), idOf(p, "Right side"), JOINT, "dado");
    expect(r).toMatchObject({ ok: true, joint: { type: "dado" } });
    if (r.ok)
      expect(r.description).toBe('Top in a dado in Right side, 23/32" wide and 15/64" deep');
  });

  it("refuses a joint id the project already uses", () => {
    const p = looseBoards();
    p.joints = [{ id: JOINT, type: "dado", host: idOf(p, "Right side"), guest: SHELF, params: {} }];
    expect(proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT)).toEqual({
      ok: false,
      reason: "That joint already exists; pick a different id for the new one.",
    });
  });

  it("refuses a project that cannot be placed", () => {
    const p = looseBoards();
    p.instances = p.instances.map((i) => ({ ...i, def: "01K7M3Q8ZD00000000T9000098" }));
    expect(proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT)).toEqual({
      ok: false,
      reason: "The project has a problem that stops Kerf placing its boards; fix it first.",
    });
  });

  it("refuses one board of a row, and says to detach it", () => {
    const g = generateStructures(loadProject("bookcase", "structure"), shop);
    const member = "01K7M3Q8ZD000000VD1W6VCPZA:0";
    const side = g.instances.find((i) => i.name === "Right side");
    expect(proposeJoint(g, shop, member, side?.id ?? "", JOINT)).toEqual({
      ok: false,
      reason: "Shelf 1 is one of a row; detach it first to join it on its own.",
    });
  });

  it("proposes through dovetails, with hand tools, for boards crossing at a corner", () => {
    const box = generateStructures(loadProject("box", "structure"), shop);
    const p: Project = {
      ...box,
      structures: [],
      joints: [],
      matchSets: [],
      patterns: [],
      parts: box.parts.map(({ source: _s, detached: _d, ...part }) => part),
      instances: box.instances.map(({ generatedBy: _, ...i }) => i),
    };
    const r = proposeJoint(p, shop, idOf(p, "Front"), idOf(p, "Side A"), JOINT);
    expect(r).toMatchObject({
      ok: true,
      joint: { type: "throughDovetail" },
      tool: "handTools",
      missing: false,
    });
  });

  it("refuses two boards lying face to face", () => {
    const p = looseBoards();
    const top = p.instances.find((i) => i.name === "Loose shelf");
    if (!top) throw new Error("no shelf");
    p.instances.push({
      ...top,
      id: "01K7M3Q8ZD00000000T9000003",
      name: "Stacked shelf",
      position: { ...top.position, z: "36in + 23/32in" },
    });
    expect(proposeJoint(p, shop, SHELF, "01K7M3Q8ZD00000000T9000003", JOINT)).toEqual({
      ok: false,
      reason:
        "Loose shelf and Stacked shelf lie face to face; glue them, there is no joint to cut.",
    });
  });

  it("refuses two boards meeting end to end", () => {
    const p = looseBoards();
    const side = p.instances.find((i) => i.name === "Right side");
    if (!side) throw new Error("no side");
    p.instances.push({
      ...side,
      id: "01K7M3Q8ZD00000000T9000004",
      name: "Taller side",
      position: { ...side.position, z: "72in" },
    });
    expect(proposeJoint(p, shop, side.id, "01K7M3Q8ZD00000000T9000004", JOINT)).toEqual({
      ok: false,
      reason: "Right side and Taller side meet end to end; Kerf has no joint for that yet.",
    });
  });

  it("does not change the project it is given", () => {
    const p = looseBoards();
    const before = JSON.stringify(p);
    proposeJoint(p, shop, idOf(p, "Right side"), SHELF, JOINT);
    expect(JSON.stringify(p)).toBe(before);
  });
});
