// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "1. Start": template cards (Bookcase, Keepsake box, Blank case, Blank box) and
// the overall size first. Labels are the end-to-end contract (design spec).

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("the Start step", () => {
  it("shows the four templates after New", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    for (const name of ["Bookcase", "Keepsake box", "Blank case", "Blank box"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("starts a bookcase and shows its overall size", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("button", { name: "Bookcase" }));
    expect(store.getState().history?.entries[0]?.label).toBe("New bookcase");
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe('36"');
  });

  it("starts a keepsake box measured Length, Width, Height", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("button", { name: "Keepsake box" }));
    expect((screen.getByLabelText("Length") as HTMLInputElement).value).toBe('10"');
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe('6"');
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe('4"');
  });

  it("shows the shop checklist on first launch", () => {
    setup();
    expect(screen.getByRole("button", { name: "Your shop" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Dado stack")).toBeTruthy();
  });

  it("names no section with the word New, so the New button stays unique", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /new/i })).toHaveLength(1);
  });
});
