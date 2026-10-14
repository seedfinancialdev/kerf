// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, D2: Accept all marks the joinery reviewed; it can be undone.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject, type TemplateName } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";

function setup(template: TemplateName = "Bookcase") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject(template, "imperial"));
  act(() => store.getState().setStep("Joinery"));
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("the Joinery step", () => {
  it('lists the shelves\' dados once for each side, 23/32" wide and 1/4" deep', () => {
    // Operation specs, bookcase: the shelves sit in 23/32" x 1/4" dados in each side. The form
    // joins its row of shelves to each side with one joint (structures/openings.ts), so there is
    // one line per side.
    setup();
    const rows = screen
      .getAllByText(/^Shelf in dados in /)
      .map((e) => [e.textContent, e.closest("li")?.querySelector(".joint-detail")?.textContent]);
    expect(rows.sort()).toEqual([
      ["Shelf in dados in Left side", '23/32" wide, 1/4" deep'],
      ["Shelf in dados in Right side", '23/32" wide, 1/4" deep'],
    ]);
  });

  it("accepts all, then says so", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(shownProject(store.getState())?.structures[0]?.options.joineryReviewed).toBe(true);
    expect(screen.getByText("Joinery accepted. You can still change any joint.")).toBeTruthy();
  });

  it("undoes Accept all", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    act(() => store.getState().undo());
    expect(shownProject(store.getState())?.structures[0]?.options.joineryReviewed).toBeUndefined();
  });

  it("offers the box's corner choice and applies it", () => {
    const store = setup("Keepsake box");
    fireEvent.change(screen.getByLabelText("Corners"), { target: { value: "rabbet" } });
    expect(shownProject(store.getState())?.structures[0]?.options.cornerJoint).toBe("rabbet");
  });
});
