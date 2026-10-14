// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Tweak": "Editing a board that a form generated detaches only that board, with
// a notice ('Shelf 3 is now custom; the form won't change it')". One wording for every tool.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { describe, expect, it } from "vitest";
import { detachForEdit, startProject } from "./commands";
import { followsForm, namesTaken, takenOver, takeOverNotice } from "./take-over";

const shop = loadShopProfile();
const bookcase = () => startProject("Bookcase", "imperial").project;
const placementsOf = (p = bookcase()) => solve(p, shop).placements;
const named = (name: string) => {
  const found = placementsOf().find((x) => x.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe("followsForm()", () => {
  it("is true for a board the form makes and false once it is taken over", () => {
    const after = detachForEdit(bookcase(), named("Top"), shop).project;
    expect(followsForm(named("Top"))).toBe(true);
    expect(followsForm(placementsOf(after).find((x) => x.name === "Top") ?? named("Back"))).toBe(
      false,
    );
  });
});

describe("takenOver()", () => {
  it("lists both sides when one is taken over, because they are one board in two places", () => {
    const after = detachForEdit(bookcase(), named("Left side"), shop).project;
    expect(takenOver(placementsOf(), after)).toEqual([
      { from: "Right side", to: "Right side" },
      { from: "Left side", to: "Left side" },
    ]);
  });

  it("gives a copy taken out of its row the engine's new name, and leaves the other copies", () => {
    const after = detachForEdit(bookcase(), named("Shelf 2"), shop).project;
    expect(takenOver(placementsOf(), after)).toEqual([{ from: "Shelf 2", to: "Shelf copy 2" }]);
  });

  it("is empty when nothing was taken over", () => {
    expect(takenOver(placementsOf(), bookcase())).toEqual([]);
  });
});

describe("namesTaken()", () => {
  it("lists three boards with commas and a last 'and'", () => {
    expect(
      namesTaken([
        { from: "Top", to: "Top" },
        { from: "Shelf 1", to: "Shelf copy 1" },
        { from: "Back", to: "Back" },
      ]),
    ).toBe("Top, Shelf 1 (now Shelf copy 1) and Back");
  });
});

describe("takeOverNotice()", () => {
  it("is nothing when no board was taken over", () => {
    expect(takeOverNotice([])).toBeUndefined();
  });

  it("names one board that kept its name", () => {
    expect(takeOverNotice([{ from: "Top", to: "Top" }])).toBe(
      "Top is now custom; the form won't change it.",
    );
  });

  it("says when one board's name changes", () => {
    expect(takeOverNotice([{ from: "Shelf 1", to: "Shelf copy 1" }])).toBe(
      "Shelf 1 becomes Shelf copy 1, custom; the form won't change it.",
    );
  });

  it("names two boards, showing a changed name", () => {
    expect(
      takeOverNotice([
        { from: "Shelf 1", to: "Shelf copy 1" },
        { from: "Back", to: "Back" },
      ]),
    ).toBe("Shelf 1 (now Shelf copy 1) and Back are now custom; the form won't change them.");
  });
});
