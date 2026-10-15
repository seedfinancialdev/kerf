// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Recent files": a card with no picture of its model yet shows the drawing of its
// kind of piece, read from the project's first form.

import { ProjectFormatError, parseProject, serializeProject } from "@kerf/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startProject } from "./commands";
import { defaultChoice, newProject } from "./new-project";
import { pieceKinds } from "./piece-kind";
import { STARTER_RECORD } from "./shop-record";

/** The text the library keeps for the new project New project would make for `piece`. */
function keptText(piece: Parameters<typeof defaultChoice>[0]): string {
  const made = newProject(defaultChoice(piece, "imperial", STARTER_RECORD), STARTER_RECORD);
  if (!made.ok) throw new Error(made.message);
  return serializeProject(made.edit.project);
}

/** The kind `pieceKinds` reads from `project`, kept as project "A" changed at noon. */
const pieceKindOf = (project: string) =>
  pieceKinds()([{ id: "A", modified: NOON, project }]).get("A");

const NOON = "2026-10-15T12:00:00.000Z";

describe("pieceKinds()", () => {
  it("calls a case divided into shelves a bookcase", () => {
    expect(pieceKindOf(keptText("bookcase"))).toBe("bookcase");
  });

  it("calls a case with no shelves a cabinet", () => {
    expect(pieceKindOf(keptText("cabinet"))).toBe("cabinet");
  });

  it("calls a box a box", () => {
    expect(pieceKindOf(serializeProject(startProject("Keepsake box", "imperial").project))).toBe(
      "box",
    );
  });

  it("calls a project with no form blank", () => {
    expect(pieceKindOf(keptText("empty"))).toBe("blank");
  });

  it("calls a project whose text is damaged blank", () => {
    expect(pieceKindOf('{"name": "half a proj')).toBe("blank");
  });
});

describe("pieceKinds() remembering", () => {
  afterEach(() => vi.restoreAllMocks());

  const box = serializeProject(startProject("Keepsake box", "imperial").project);
  const bookcase = keptText("bookcase");

  it("reads each project once over two listings of the same projects", () => {
    const parse = vi.fn(parseProject);
    const kinds = pieceKinds(parse);
    const kept = [
      { id: "A", modified: NOON, project: box },
      { id: "B", modified: NOON, project: bookcase },
    ];
    kinds(kept);
    const again = kinds(kept);
    // Two projects, each read once; the second listing reads nothing.
    expect(parse).toHaveBeenCalledTimes(2);
    expect([again.get("A"), again.get("B")]).toEqual(["box", "bookcase"]);
  });

  it("reads a project again once it has changed", () => {
    const parse = vi.fn(parseProject);
    const kinds = pieceKinds(parse);
    kinds([{ id: "A", modified: NOON, project: box }]);
    const changed = kinds([{ id: "A", modified: "2026-10-15T13:00:00.000Z", project: bookcase }]);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(changed.get("A")).toBe("bookcase");
  });

  it("forgets a project no longer listed, so one put back is read afresh", () => {
    const parse = vi.fn(parseProject);
    const kinds = pieceKinds(parse);
    kinds([{ id: "A", modified: NOON, project: box }]);
    kinds([]);
    kinds([{ id: "A", modified: NOON, project: box }]);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("calls a project blank and logs why when reading it fails for a reason not in its text, and reads the rest", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fault = new TypeError("x is undefined");
    const kinds = pieceKinds((text) => {
      if (text === bookcase) throw fault;
      return parseProject(text);
    });
    const read = kinds([
      { id: "A", modified: NOON, project: box },
      { id: "B", modified: NOON, project: bookcase },
    ]);
    expect([read.get("A"), read.get("B")]).toEqual(["box", "blank"]);
    expect(logged).toHaveBeenCalledWith(fault);
  });

  it("does not log a project the engine refuses: that is the text, not a fault", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const read = pieceKinds(() => {
      throw new ProjectFormatError("$.name", "missing");
    })([{ id: "A", modified: NOON, project: box }]);
    expect(read.get("A")).toBe("blank");
    expect(logged).not.toHaveBeenCalled();
  });
});
