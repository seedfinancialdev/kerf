// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Recent files": a card with no picture of its model yet shows the drawing of its
// kind of piece, read from the project's first form.

import { serializeProject } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { defaultChoice, newProject } from "./new-project";
import { pieceKindOf } from "./piece-kind";
import { STARTER_RECORD } from "./shop-record";

/** The text the library keeps for the new project New project would make for `piece`. */
function keptText(piece: Parameters<typeof defaultChoice>[0]): string {
  const made = newProject(defaultChoice(piece, "imperial", STARTER_RECORD), STARTER_RECORD);
  if (!made.ok) throw new Error(made.message);
  return serializeProject(made.edit.project);
}

describe("pieceKindOf()", () => {
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
