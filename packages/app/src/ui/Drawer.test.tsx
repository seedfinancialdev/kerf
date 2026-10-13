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
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Drawer } from "./Drawer";

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

  function blockTheBookcase(store: ReturnType<typeof setup>) {
    const p = shownProject(store.getState());
    if (!p) throw new Error("no project");
    act(() => {
      store.getState().apply(setOption(p, p.structures[0]?.id ?? "", "dadoDepth", "23/32in"));
    });
  }

  it("shows a banner while the project has an error", () => {
    blockTheBookcase(setup());
    expect(screen.getByRole("alert").textContent).toMatch(/^Not ready to build: /);
  });

  it("withholds the plan in every tab while the project has an error", () => {
    blockTheBookcase(setup());
    for (const name of ["Shopping", "Cut list", "Sheets", "Setups", "Assembly"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      for (const row of ["cutlist-line", "sheet", "setup", "assembly-step"]) {
        expect(screen.queryAllByTestId(row), `${name}/${row}`).toHaveLength(0);
      }
      expect(screen.getByRole("tabpanel").textContent).toBe(
        "Nothing to show until the problem above is fixed.",
      );
    }
  });

  it("makes only the chosen tab a tab stop", () => {
    setup();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1", "-1"]);
    expect(screen.getByRole("tablist", { name: "Plan sections" })).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("tabindex")).toBe("0");
  });

  it("moves between tabs with the arrow, Home and End keys", () => {
    setup();
    const selected = () => screen.getByRole("tab", { selected: true }).textContent;
    fireEvent.keyDown(screen.getByRole("tab", { name: "Cut list" }), { key: "ArrowRight" });
    expect(selected()).toBe("Sheets");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Sheets" }), { key: "End" });
    expect(selected()).toBe("Assembly");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Assembly" }), { key: "ArrowRight" });
    expect(selected()).toBe("Shopping");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Shopping" }), { key: "ArrowLeft" });
    expect(selected()).toBe("Assembly");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Assembly" }), { key: "Home" });
    expect(selected()).toBe("Shopping");
  });
});
