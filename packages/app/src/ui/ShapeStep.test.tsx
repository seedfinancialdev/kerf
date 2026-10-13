// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "2. Shape" table (Case: carcase stock; top/bottom between sides or sides
// between; back none / inset in rabbets / applied; back stock). Labels: end-to-end contract.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";
import { KerfProvider } from "./useKerf";

function setup(template: "Bookcase" | "Keepsake box" = "Bookcase") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject(template, "imperial"));
  store.getState().setStep("Shape");
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

const select = (label: string) =>
  screen.getByLabelText(label, { exact: true }) as HTMLSelectElement;
const optionText = (s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent;

describe("the Shape step", () => {
  it("shows the bookcase's form as the template set it", () => {
    setup();
    expect(optionText(select("Carcase stock"))).toBe("3/4 plywood");
    expect(optionText(select("Top and bottom"))).toBe("Between the sides");
    expect(optionText(select("Back"))).toBe("Inset in rabbets");
    expect(optionText(select("Back stock"))).toBe("1/4 plywood");
  });

  it("removes the back: the back stock field goes and the cut list loses its back line", () => {
    const store = setup();
    fireEvent.change(select("Back"), { target: { value: "none" } });
    expect(screen.queryByLabelText("Back stock")).toBeNull();
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Back: none");
    const p = shownProject(store.getState());
    if (!p) throw new Error("no project");
    // Operation specs: the back is its own line; without it 2 lines remain.
    expect(solve(p, loadShopProfile()).cutList.lines).toHaveLength(2);
  });

  it("keeps advanced depths behind More, closed at first", () => {
    setup();
    expect(screen.queryByLabelText("Dado depth")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByLabelText("Dado depth")).toBeTruthy();
  });

  it("shows a box's walls, corners and bottom", () => {
    setup("Keepsake box");
    expect(optionText(select("Wall stock"))).toBe("4/4 walnut");
    expect(optionText(select("Corners"))).toBe("Through dovetails");
    expect(optionText(select("Bottom"))).toBe("In a groove");
    expect((screen.getByLabelText("Grain wraps the corners") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("refuses a depth that is not a length and records nothing", () => {
    const store = setup();
    const before = store.getState().history?.entries.length;
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const field = screen.getByLabelText("Dado depth");
    fireEvent.change(field, { target: { value: "abc" } });
    fireEvent.blur(field);
    expect(document.querySelector(".field-problem")?.textContent).toBeTruthy();
    expect(store.getState().history?.entries.length).toBe(before);
  });

  it("has no button named Joinery, so the step switcher stays unique", () => {
    setup();
    expect(screen.queryByRole("button", { name: /joinery/i })).toBeNull();
  });
});
