// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The labels the end-to-end test uses: Radius (options from the shop's bits) and "Both front edges".

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setShelves, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { EdgePanel } from "./EdgePanel";
import { Inspector } from "./Inspector";

function setup(boards = "Shelf") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  store.getState().setStep("Joinery");
  const shelves =
    store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === boards)
      .map((p) => p.instance) ?? [];
  store.getState().select({ kind: "boards", instances: shelves });
  store.getState().setTool("edge");
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("<EdgePanel>", () => {
  it("offers the shop's roundover bits as radii", () => {
    setup();
    const radius = screen.getByLabelText("Radius") as HTMLSelectElement;
    expect([...radius.options].map((o) => o.textContent)).toEqual(["None", '1/8"']);
  });

  it("rounds both front edges of the shelves with the chosen bit", () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "25400" } });
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(shownProject(store.getState())?.structures[0]?.options.shelfRoundover).toBe("3.175mm");
  });

  it("tells the user, with Undo, that the Top it rounded is now custom (final branch review I2)", () => {
    const store = setup("Top");
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(store.getState().notice).toEqual({
      text: "Top is now custom; the form won't change it.",
      kind: "undo",
    });
  });

  it("tells the user before they press it that Both front edges changes every shelf the form makes (branch deferred row 26)", () => {
    const store = setup();
    const { selection } = store.getState();
    if (selection.kind !== "boards") throw new Error("no shelves picked");
    // One shelf picked: the roundover is still the form's, for all four (ADR 015, D3).
    act(() =>
      store.getState().select({ kind: "boards", instances: selection.instances.slice(0, 1) }),
    );
    expect(
      screen.getByText(
        "Both front edges rounds every shelf the form makes, so they keep following it.",
      ),
    ).toBeTruthy();
  });

  it("says nothing about every shelf when the pick is not the form's shelves", () => {
    setup("Top");
    expect(screen.queryByText(/every shelf the form makes/)).toBeNull();
  });

  it("rounds the ticked edges", () => {
    const store = setup("Top");
    fireEvent.click(screen.getByLabelText("Back edge, show face"));
    fireEvent.click(screen.getByRole("button", { name: "Round the ticked edges" }));
    expect(shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops).toMatchObject([
      { type: "roundover", edges: ["edge0/face1"], radius: "3.175mm" },
    ]);
  });

  it("says so, and records nothing, when None is chosen for a board with no roundover", () => {
    const store = setup("Top");
    const before = shownProject(store.getState());
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(store.getState().notice?.text).toBe("There's no roundover on those edges to remove.");
    expect(shownProject(store.getState())).toBe(before);
  });

  it("says why a board cannot be taken over, and leaves the project alone", () => {
    // A pick made while the row had four shelves; the form now makes two, so shelf 4 is gone.
    const store = setup();
    const shelves = store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === "Shelf");
    const gone = shelves?.[3];
    const project = shownProject(store.getState());
    const structure = project?.structures[0];
    if (!gone || !project || !structure) throw new Error("no shelves to pick");
    const fewer = setShelves(project, structure.id, structure.openings[0]?.id ?? "", "2", "even");
    if (!fewer.ok) throw new Error(fewer.message);
    act(() => store.getState().apply(fewer.edit));
    const before = shownProject(store.getState());
    cleanup();
    render(
      <KerfProvider store={store}>
        <EdgePanel placed={[gone]} />
      </KerfProvider>,
    );
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "25400" } });
    fireEvent.click(screen.getByLabelText("Back edge, show face"));
    fireEvent.click(screen.getByRole("button", { name: "Round the ticked edges" }));
    expect(store.getState().notice?.text).toMatch(/no copy 4 of/i);
    expect(shownProject(store.getState())).toBe(before);
  });
});
