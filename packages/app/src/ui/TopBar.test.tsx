// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Tooltips": every control has one, including Undo and Redo while there is nothing to undo.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { startProject } from "../model/commands";
import { workshopStore } from "../testing/workshop-store";

async function openApp() {
  const store = await workshopStore();
  render(<App store={store} model={null} />);
  return store;
}

describe("<TopBar> tips", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("names Undo while it is disabled, since a disabled button gets no pointer events", async () => {
    render(<App store={await workshopStore()} model={null} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.hasAttribute("disabled")).toBe(true);
    // The pointer enters the wrapper around the button, which is what a browser reports.
    fireEvent.pointerEnter(undo.parentElement as HTMLElement);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toContain("Take back your last change.");
  });

  it("shows Redo's tip when Tab reaches it", async () => {
    const store = await openApp();
    act(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
      store.getState().undo();
    });
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("button", { name: "Redo" }).focus());
    expect(screen.getByRole("tooltip").textContent).toContain("Put back the change");
  });

  it("describes Shape for the kind of project that is open", async () => {
    const store = await openApp();
    act(() => {
      store.getState().apply(startProject("Blank box", "imperial"));
      store.getState().setStep("Divide");
    });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Shape" }));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toContain("how the box is built");
  });
});
