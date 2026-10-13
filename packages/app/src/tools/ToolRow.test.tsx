// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// "Icons always carry text labels" (Interaction spec); keys as SketchUp.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  render(<App store={store} model={null} />);
  return store;
}

describe("<ToolRow>", () => {
  it("shows each tool's name and key", () => {
    setup();
    expect(screen.getByRole("button", { name: "Edge profile F" })).toBeTruthy();
  });

  it("picks a tool from its key, and Escape goes back to Select and clears the selection", () => {
    const store = setup();
    act(() => store.getState().select({ kind: "boards", instances: ["a"] }));
    fireEvent.keyDown(window, { key: "p" });
    expect(store.getState().tool).toBe("pushPull");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().tool).toBe("select");
    expect(store.getState().selection).toEqual({ kind: "none" });
  });

  it("leaves E alone and keeps the navigation keys working", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "e" });
    expect(store.getState().tool).toBe("select");
    fireEvent.keyDown(window, { key: "o" });
    expect(store.getState().navigation).toBe("orbit");
  });

  it("ignores tool keys while typing in a field", () => {
    const store = setup();
    const input = screen.getByLabelText("Measurements");
    fireEvent.keyDown(input, { key: "p" });
    expect(store.getState().tool).toBe("select");
  });

  it("marks the active tool pressed when its button is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Tape T" }));
    expect(screen.getByRole("button", { name: "Tape T" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("refuses typed text for a tool that takes no size, in plain words", () => {
    setup();
    const input = screen.getByLabelText("Measurements");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("This tool takes no typed size.")).toBeTruthy();
  });
});
