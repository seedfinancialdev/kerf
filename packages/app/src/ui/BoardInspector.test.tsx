// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Inspector": "a part's properties ('Length 34-9/16" · cut 35-1/16"')";
// Domain model, decision 3: "The UI always shows both when they differ".

import type { Id } from "@kerf/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addRoundover, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";
import { KerfProvider } from "./useKerf";

type Store = ReturnType<typeof createKerfStore>;

const placements = (store: Store) => store.getState().solved?.result.placements ?? [];
const shelves = (store: Store): Id[] =>
  placements(store)
    .filter((p) => p.source?.role === "shelf")
    .map((p) => p.instance);
const topOf = (store: Store): Id[] =>
  placements(store)
    .filter((p) => p.name === "Top")
    .map((p) => p.instance);

function setup(pick: (store: Store) => Id[]) {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  act(() => {
    store.getState().setStep("Shape");
    store.getState().select({ kind: "boards", instances: pick(store) });
  });
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("<BoardInspector>", () => {
  it("shows a shelf's visible and cut length", () => {
    setup(shelves);
    expect(screen.getByText('34-9/16" · cut 35-1/16"')).toBeTruthy();
  });

  it("says four shelves are selected and that the form makes them", () => {
    setup(shelves);
    expect(screen.getByRole("heading", { name: "Shelf × 4" })).toBeTruthy();
    expect(screen.getByText("Made by the form. Editing one by hand takes it over.")).toBeTruthy();
  });

  it("names a mixed pick by how many boards it holds", () => {
    setup((s) => [...shelves(s), ...topOf(s)]);
    expect(screen.getByRole("heading", { name: "5 boards" })).toBeTruthy();
  });

  it("offers to hand a taken-over board back to the form", () => {
    const store = setup(topOf);
    expect(screen.queryByRole("button", { name: "Follow the form again" })).toBeNull();
    const p = shownProject(store.getState());
    const top = placements(store).find((x) => x.name === "Top");
    if (!p || !top) throw new Error("no top");
    act(() => {
      store.getState().apply(addRoundover(p, top, ["edge1/face1"], 25_400, store.getState().shop));
      store.getState().select({ kind: "boards", instances: topOf(store) });
    });
    fireEvent.click(screen.getByRole("button", { name: "Follow the form again" }));
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Top follows the form again");
  });

  it('lists a problem on the picked board: a 3" roundover on a 23/32" top', () => {
    const store = setup(topOf);
    const p = shownProject(store.getState());
    const top = placements(store).find((x) => x.name === "Top");
    if (!p || !top) throw new Error("no top");
    act(() => {
      store
        .getState()
        .apply(addRoundover(p, top, ["edge1/face1"], 3 * 203_200, store.getState().shop));
      store.getState().select({ kind: "boards", instances: topOf(store) });
    });
    expect(document.querySelector(".problem.error")).not.toBeNull();
  });

  it("shows no problems for a board that has none", () => {
    setup(topOf);
    expect(document.querySelector(".problems")).toBeNull();
  });

  it("leaves the Shape step's Width field to the step once the step changes", () => {
    const store = setup(shelves);
    act(() => {
      store.getState().setStep("Joinery");
      store.getState().select({ kind: "boards", instances: shelves(store) });
      store.getState().setStep("Shape");
    });
    expect(screen.getByLabelText("Width")).toBeTruthy();
  });
});
