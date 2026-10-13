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

  it("allows the shop phrases show face, inside face, outside face and face to face", () => {
    expect(
      bannedWordsIn("Round the show face. The inside face. Outside face. Lie face to face."),
    ).toEqual([]);
  });

  it("does not flag a word that merely contains a banned word", () => {
    expect(bannedWordsIn("Surface, facet, meshwork")).toEqual([]);
  });

  it("returns nothing for plain shop language", () => {
    expect(bannedWordsIn('Shelves in dados, 23/32" wide, 1/4" deep')).toEqual([]);
  });
});
