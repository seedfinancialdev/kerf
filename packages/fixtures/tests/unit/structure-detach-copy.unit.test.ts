// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Detaching one copy out of a repeated board (Interaction spec, "Tweak in 3D": "editing a board
// that a form generated detaches only that board"), and detaching the boards that hand-made
// objects refer to so a project can be saved. Heights are hand calculations in 1/64ths of an inch.

import {
  attachCopyIn,
  buildCutList,
  detachCopyIn,
  detachPartIn,
  detachReferencedBoards,
  generateStructures,
  type Project,
  ProjectFormatError,
  parseProject,
  removeStructureIn,
  serializeProject,
  solve,
  solveModel,
} from "@kerf/core";
import { describe, expect, it } from "vitest";
import { loadProject, loadShopProfile, withParam } from "../../src/index";

const shop = loadShopProfile();
const form = (): Project => loadProject("bookcase", "structure");
const shelfPattern = (p: Project) => {
  const pattern = p.patterns[0];
  if (!pattern) throw new Error("the form generated no shelf pattern");
  return pattern;
};
const shelfHeights = (p: Project): number[] =>
  solveModel(generateStructures(p, shop))
    .instances.filter((i) => i.name.startsWith("Shelf"))
    .map((i) => i.position.z)
    .sort((a, b) => a - b);

describe("detaching one shelf out of four", () => {
  const made = (): Project => generateStructures(form(), shop);
  const second = (): Project => detachCopyIn(made(), shelfPattern(made()).id, 1);

  it("leaves every shelf where it was", () => {
    // Four shelves share 70-9/16 between top and bottom with equal gaps of 13.5375; their
    // undersides are at 14-1/4, 28-1/2 (rounded), 42-3/4 and 57 inches, as the form places them.
    expect(shelfHeights(second())).toEqual(shelfHeights(made()));
  });

  it("is still six boards in one cut list line, the detached one included", () => {
    const line = buildCutList(second()).lines.find((l) => l.parts.some((p) => p.name === "Shelf"));
    expect(line?.quantity).toBe(6);
    expect(solve(second(), shop).diagnostics).toEqual([]);
  });

  it("keeps the dados the form gave it", () => {
    const joints = generateStructures(second(), shop).joints;
    const detachedInstance = second().instances.find((i) => i.detachedFrom !== undefined);
    expect(joints.filter((j) => j.guest === detachedInstance?.id)).toHaveLength(2);
  });

  it("stays where it was when the case grows, while the other shelves re-space", () => {
    const frozen = shelfHeights(second())[1];
    const taller = shelfHeights(withParam(second(), "height", "84in"));
    expect(taller).toContain(frozen);
    expect(taller).toHaveLength(4);
  });

  it("survives saving and loading", () => {
    const loaded = parseProject(serializeProject(second()));
    expect(shelfHeights(loaded)).toEqual(shelfHeights(made()));
    expect(loaded.instances.filter((i) => i.detachedFrom !== undefined)).toHaveLength(1);
  });

  it("is regenerated to the same project every time", () => {
    const once = generateStructures(second(), shop);
    expect(generateStructures(once, shop)).toEqual(once);
  });

  it("names the detached shelf so every board has its own name", () => {
    const names = second().parts.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("attaching a copy again", () => {
  it("puts the shelf back into the row, where the form puts it", () => {
    const made = generateStructures(form(), shop);
    const detached = detachCopyIn(made, shelfPattern(made).id, 1);
    const copy = detached.instances.find((i) => i.detachedFrom !== undefined);
    if (!copy) throw new Error("no detached copy");
    const restored = generateStructures(attachCopyIn(detached, copy.id), shop);
    expect(restored).toEqual(generateStructures(made, shop));
  });

  it("refuses an instance that is not a detached copy", () => {
    const made = generateStructures(form(), shop);
    expect(() => attachCopyIn(made, made.instances[0]?.id ?? "")).toThrow(RangeError);
  });
});

describe("detachCopyIn() refuses what it cannot do", () => {
  it("a copy that is not there, or a pattern that is not there", () => {
    const made = generateStructures(form(), shop);
    expect(() => detachCopyIn(made, shelfPattern(made).id, 9)).toThrow(RangeError);
    expect(() => detachCopyIn(made, "01K7M3Q8ZD00000000B1000999", 0)).toThrow(RangeError);
  });
});

describe("detachReferencedBoards()", () => {
  it("detaches the boards a hand-made joint names, so the project can be saved", () => {
    const made = generateStructures(form(), shop);
    const top = made.instances.find((i) => i.name === "Top");
    const back = made.instances.find((i) => i.name === "Back");
    if (!top || !back) throw new Error("the form generated no top or back");
    const joined: Project = {
      ...made,
      joints: [
        ...made.joints,
        {
          id: "01K7M3Q8ZD00000000B1000099",
          type: "rabbet",
          host: top.id,
          guest: back.id,
          params: {},
        },
      ],
    };
    expect(() => serializeProject(joined)).toThrow(ProjectFormatError);
    const result = detachReferencedBoards(joined);
    expect(result.detached.map((p) => p.name).sort()).toEqual(["Back", "Top"]);
    const saved = parseProject(serializeProject(result.project));
    expect(saved.parts.map((p) => p.name).sort()).toEqual(["Back", "Top"]);
    expect(saved.joints).toHaveLength(1);
  });

  it("changes nothing when nothing hand-made refers to a generated board", () => {
    const made = generateStructures(form(), shop);
    const result = detachReferencedBoards(made);
    expect(result.detached).toEqual([]);
    expect(result.project).toEqual(made);
  });
});

describe("a detached copy and the rest of the form", () => {
  const made = (): Project => generateStructures(form(), shop);
  const copyOf = (p: Project) => p.instances.find((i) => i.detachedFrom !== undefined);

  it("attaching it again after regeneration leaves no joint pointing at it", () => {
    const regenerated = generateStructures(detachCopyIn(made(), shelfPattern(made()).id, 1), shop);
    const copy = copyOf(regenerated);
    if (!copy) throw new Error("no detached copy");
    const restored = attachCopyIn(regenerated, copy.id);
    expect(solve(restored, shop).diagnostics.map((d) => d.rule)).not.toContain("invalid-project");
    expect(generateStructures(restored, shop)).toEqual(generateStructures(made(), shop));
  });

  it("refuses to attach it while something you added refers to it", () => {
    const detached = detachCopyIn(made(), shelfPattern(made()).id, 1);
    const copy = copyOf(detached);
    const top = detached.instances.find((i) => i.name === "Top");
    if (!copy || !top) throw new Error("form did not generate the boards");
    const joined: Project = {
      ...detached,
      joints: [
        ...detached.joints,
        {
          id: "01K7M3Q8ZD00000000B1000097",
          type: "dado",
          host: top.id,
          guest: copy.id,
          params: {},
        },
      ],
    };
    expect(() => attachCopyIn(joined, copy.id)).toThrow(/something you added/i);
  });

  it("is said to be stale, and left where it is, when the number of shelves changes", () => {
    const detached = detachCopyIn(made(), shelfPattern(made()).id, 3);
    const eight = withParam(detached, "shelf_count", "8");
    const rules = solve(eight, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);
    expect(rules).toContain("warning:detached-copy-stale");
    // The row is made in full again: 8 shelves plus the board that was taken out.
    expect(
      solveModel(generateStructures(eight, shop)).instances.filter((i) =>
        i.name.startsWith("Shelf"),
      ),
    ).toHaveLength(9);
  });

  it("does not take the name of a shelf the form makes later", () => {
    const detached = detachCopyIn(made(), shelfPattern(made()).id, 0);
    const names = detached.parts.map((p) => p.name);
    // The form's own numbering for several shelf openings is "Shelf 1", "Shelf 2", and so on.
    expect(names.filter((n) => /^Shelf \d+$/.test(n))).toEqual([]);
  });

  it("refuses a copy number that is not 0 or more", () => {
    const base = made();
    expect(() => detachCopyIn(base, shelfPattern(base).id, -1)).toThrow(RangeError);
    expect(() => detachCopyIn(base, shelfPattern(base).id, 1.5)).toThrow(RangeError);
  });

  it("takes a structure away and leaves its detached boards as your own", () => {
    const detached = detachPartIn(
      made(),
      made().parts.find((p) => p.source?.role === "top")?.id ?? "",
    );
    const structureId = detached.structures[0]?.id ?? "";
    const released = removeStructureIn(detached, structureId);
    expect(released.structures).toEqual([]);
    expect(released.parts.map((p) => p.name)).toEqual(["Top"]);
    expect(released.parts[0]?.source).toBeUndefined();
    // It is an ordinary project again: it solves and it saves.
    expect(solve(released, shop).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(() => serializeProject(released)).not.toThrow();
  });
});

describe("malformed input to the detach functions", () => {
  it("is a typed error, not a TypeError", () => {
    expect(() => detachCopyIn(null as unknown as Project, "x", 0)).toThrow(ProjectFormatError);
    expect(() => attachCopyIn({} as unknown as Project, "x")).toThrow(ProjectFormatError);
    expect(() => detachReferencedBoards({} as unknown as Project)).toThrow(ProjectFormatError);
  });
});
