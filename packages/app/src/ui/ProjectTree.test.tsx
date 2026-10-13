// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { HistoryPanel } from "./HistoryPanel";
import { ProjectTree } from "./ProjectTree";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  render(
    <KerfProvider store={store}>
      <ProjectTree />
      <HistoryPanel />
    </KerfProvider>,
  );
  return store;
}

describe("<ProjectTree>", () => {
  it("selects the four shelves from their row", () => {
    const store = setup();
    fireEvent.click(screen.getByTestId("part-group-shelves"));
    const sel = store.getState().selection;
    expect(sel.kind === "boards" ? sel.instances.length : 0).toBe(4);
  });

  it("selects the opening from its row", () => {
    const store = setup();
    fireEvent.click(screen.getAllByTestId("opening")[0] as HTMLElement);
    expect(store.getState().selection.kind).toBe("opening");
  });

  it("uses tree items, never buttons, so no row can be mistaken for a button", () => {
    setup();
    expect(screen.getAllByRole("treeitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Bookcase/ })).toBeNull();
  });
});

describe("<HistoryPanel>", () => {
  it("steps back to an entry when it is clicked", () => {
    const store = setup();
    store.getState().apply(startProject("Blank case", "imperial"));
    fireEvent.click(screen.getByRole("option", { name: "New bookcase" }));
    expect(store.getState().history?.at).toBe(0);
  });
});
