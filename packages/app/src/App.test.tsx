// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Workflow modules" and "Screen layout"; design spec, "Layout".

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { startProject } from "./model/commands";
import { createStorage } from "./model/storage";
import { createKerfStore } from "./model/store";
import { memoryStorage } from "./testing/memory-storage";

/** Changes the store the way a click would: inside `act`, so the screen has redrawn afterwards. */
function change(run: () => void): void {
  act(run);
}

function renderApp() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  render(<App store={store} model={null} />);
  return store;
}

describe("<App>", () => {
  it("shows the five steps, Start first and pressed", () => {
    renderApp();
    const steps = screen.getByRole("navigation", { name: "Workflow" }).querySelectorAll("button");
    expect([...steps].map((b) => b.textContent)).toEqual([
      "Start",
      "Shape",
      "Divide",
      "Joinery",
      "Build plan",
    ]);
    expect(screen.getByRole("button", { name: "Start" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("moves to Shape and shows what Shape is for", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Shape" }));
    expect(screen.getByRole("button", { name: "Shape" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^Shape — choose how the case is built/)).toBeTruthy();
  });

  it("has the project, model and inspector regions", () => {
    renderApp();
    expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Model" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
  });

  it("offers Undo only once there is something to undo", () => {
    const store = renderApp();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().history?.at).toBe(0);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(store.getState().history?.at).toBe(1);
  });

  it("shows a notice with an Undo this button that undoes the change", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store
        .getState()
        .apply(
          startProject("Blank case", "imperial"),
          "Shelf 3 is now custom; the form won't change it",
        );
    });
    expect(screen.getByRole("status").textContent).toContain("Shelf 3 is now custom");
    fireEvent.click(screen.getByRole("button", { name: "Undo this" }));
    expect(store.getState().history?.at).toBe(0);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("leaves Ctrl+Z alone while typing in a field", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    const field = document.createElement("input");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "z", ctrlKey: true });
    field.remove();
    expect(store.getState().history?.at).toBe(1);
  });

  it("undoes with Cmd+Z", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(store.getState().history?.at).toBe(0);
  });

  it("puts the theme on the page", () => {
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
