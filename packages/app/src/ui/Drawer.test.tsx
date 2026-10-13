// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Build plan drawer (bottom): Shopping, Cut list, Sheets, Setups, Assembly, live
// on every edit." Core flow step 6: 3 cut list lines, 3 sheets, 3 setups, the assembly order.
// "The build plan never lies: while any error exists, the drawer shows a banner."

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setOption, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Drawer } from "./Drawer";
import { KerfProvider } from "./useKerf";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  render(
    <KerfProvider store={store}>
      <Drawer />
    </KerfProvider>,
  );
  return store;
}

describe("<Drawer>", () => {
  it("shows 3 cut list lines", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Cut list" }));
    expect(screen.getAllByTestId("cutlist-line")).toHaveLength(3);
  });

  it("shows 3 sheets", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Sheets" }));
    expect(screen.getAllByTestId("sheet")).toHaveLength(3);
  });

  it('shows 3 setups, the first 1/4" deep', () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Setups" }));
    const setups = screen.getAllByTestId("setup");
    expect(setups).toHaveLength(3);
    expect(setups[0]?.textContent).toContain('1/4" deep');
  });

  it("shows the four assembly steps", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Assembly" }));
    expect(screen.getAllByTestId("assembly-step")).toHaveLength(4);
  });

  it("shows a banner, not a plan, while the project has an error", () => {
    const store = setup();
    const p = shownProject(store.getState());
    if (!p) throw new Error("no project");
    act(() => {
      store.getState().apply(setOption(p, p.structures[0]?.id ?? "", "dadoDepth", "23/32in"));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/^Not ready to build: /);
  });
});
