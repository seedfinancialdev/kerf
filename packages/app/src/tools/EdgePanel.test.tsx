// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The labels the end-to-end test uses: Radius (options from the shop's bits) and "Both front edges".

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "../ui/Inspector";
import { KerfProvider } from "../ui/useKerf";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  store.getState().setStep("Joinery");
  const shelves =
    store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === "Shelf")
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
});
