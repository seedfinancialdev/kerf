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
  it("lists the joints", () => {
    setup();
    expect(screen.getAllByText(/^Shelf in dados in /).length).toBeGreaterThan(0);
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
