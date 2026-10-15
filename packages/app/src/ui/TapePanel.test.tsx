// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Tape: Measure, add guide lines": the reading in shop words, and keeping it.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { TapePanel } from "./TapePanel";

const IN = 203_200;

afterEach(cleanup);

function setup() {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  store.getState().begin(startProject("Bookcase", "imperial"));
  store.getState().setTool("tape");
  render(
    <KerfProvider store={store}>
      <TapePanel />
    </KerfProvider>,
  );
  return store;
}

const valueBeside = (term: string): string | null =>
  screen.getByText(term).nextElementSibling?.textContent ?? null;

describe("<TapePanel>", () => {
  it("asks for two points before there is a reading", () => {
    setup();
    expect(screen.getByText("Click two points to measure.")).toBeTruthy();
  });

  it('reads 36" left to right and straight', () => {
    const store = setup();
    act(() => store.getState().setTape({ from: [0, 0, 0], to: [36 * IN, 0, 0] }));
    expect(valueBeside("Left to right")).toBe('36"');
    expect(valueBeside("Front to back")).toBe('0"');
    expect(valueBeside("Straight line")).toBe('36"');
  });

  it("keeps the reading as a guide line, then offers to clear the guides", () => {
    const store = setup();
    act(() => store.getState().setTape({ from: [0, 0, 0], to: [36 * IN, 0, 0] }));
    expect(screen.queryByRole("button", { name: "Clear guide lines" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep as a guide line" }));
    expect(store.getState().guides).toEqual([
      [
        [0, 0, 0],
        [36 * IN, 0, 0],
      ],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Clear guide lines" }));
    expect(store.getState().guides).toEqual([]);
  });
});
