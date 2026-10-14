// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// CLAUDE.md: banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude,
// boolean. Interaction spec, "Shop language": "show face", "inside face" are what is shown instead.

import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "./banned-words";

describe("bannedWordsIn()", () => {
  it("finds each banned word, in any case and in the plural", () => {
    expect(
      bannedWordsIn("Meshes, a Vertex, faces, Components, instances, MATERIAL, extrude, boolean"),
    ).toEqual([
      "mesh",
      "vertex",
      "face",
      "component",
      "instance",
      "material",
      "extrude",
      "boolean",
    ]);
  });

  it("finds the irregular plural vertices and the forms of extrude", () => {
    expect(bannedWordsIn("Two vertices")).toEqual(["vertex"]);
    expect(bannedWordsIn("It was extruded, extruding, an extrusion")).toEqual(["extrude"]);
  });

  it("allows the shop phrases show face, inside face, outside face, face to face and face frame", () => {
    expect(
      bannedWordsIn(
        "Round the show face. The inside face. Outside face. Lie face to face. Glue the face frame.",
      ),
    ).toEqual([]);
  });

  it("still reports a bare face next to an allowed shop phrase", () => {
    expect(bannedWordsIn("Round the show face, then the face")).toEqual(["face"]);
  });

  it("does not flag a word that merely contains a banned word", () => {
    expect(bannedWordsIn("Surface, facet, meshwork, vertical, interface, extra")).toEqual([]);
  });

  it("flags material wherever it is whole, as CLAUDE.md bans it", () => {
    expect(bannedWordsIn("Materials list")).toEqual(["material"]);
  });

  it("returns nothing for plain shop language", () => {
    expect(bannedWordsIn('Shelves in dados, 23/32" wide, 1/4" deep')).toEqual([]);
  });
});
