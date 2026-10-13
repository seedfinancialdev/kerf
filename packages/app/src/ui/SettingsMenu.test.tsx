// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Neutral chrome": "a light theme as a setting"; Domain model, units: "Imperial
// fractions by default, metric as a setting". ADR 015, rule 4: units follow the stock, so an open
// project switches only when its stock sits on the new grid.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setOption, startProject } from "../model/commands";
import { STOCK_IDS } from "../model/starter";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { SettingsMenu } from "./SettingsMenu";

type Fixture = "none" | "bookcase" | "quarter-inch-bookcase";

/** A bookcase on the starter 3/4 plywood, or one whose only stock is 1/4 plywood (50800 = 635 × 80). */
function setup(fixture: Fixture = "quarter-inch-bookcase") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  if (fixture !== "none") {
    store.getState().apply(startProject("Bookcase", "imperial"));
  }
  const project = shownProject(store.getState());
  const structure = project?.structures[0];
  if (fixture === "quarter-inch-bookcase" && project && structure) {
    store.getState().apply(setOption(project, structure.id, "carcaseStock", STOCK_IDS.plywood14));
  }
  render(
    <KerfProvider store={store}>
      <SettingsMenu />
    </KerfProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return store;
}

describe("<SettingsMenu>", () => {
  it("switches to the light theme", () => {
    const store = setup();
    fireEvent.click(screen.getByLabelText("Light"));
    expect(store.getState().theme).toBe("light");
  });

  it("switches a project whose stock fits to millimetres as an undoable change", () => {
    const store = setup();
    fireEvent.click(screen.getByLabelText("Millimetres"));
    expect(shownProject(store.getState())?.units).toBe("metric");
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Units: millimetres");
    expect(store.getState().unitsForNew).toBe("metric");
  });

  it("keeps a project whose 3/4 plywood is off the grid in inches and says why", () => {
    const store = setup("bookcase");
    fireEvent.click(screen.getByLabelText("Millimetres"));
    expect(shownProject(store.getState())?.units).toBe("imperial");
    expect(store.getState().unitsForNew).toBe("metric");
    expect(store.getState().notice?.text).toBe(
      "New projects will use millimetres. " +
        "This project stays in inches because its 3/4 plywood is 23/32\" thick, which isn't a whole number of 0.01 mm.",
    );
  });

  it("sets the units for new projects when no project is open", () => {
    const store = setup("none");
    expect((screen.getByLabelText("Millimetres") as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("Millimetres"));
    expect(store.getState().unitsForNew).toBe("metric");
    expect((screen.getByLabelText("Millimetres") as HTMLInputElement).checked).toBe(true);
  });

  it("closes on Escape", () => {
    setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Light")).toBeNull();
  });
});
