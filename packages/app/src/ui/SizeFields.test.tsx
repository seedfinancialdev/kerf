// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Review Focus 5 and Operation specs, resize checks (30" → shelves 29-1/16" cut).

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { SizeFields } from "./SizeFields";
import { KerfProvider } from "./useKerf";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  const id = shownProject(store.getState())?.structures[0]?.id ?? "";
  render(
    <KerfProvider store={store}>
      <SizeFields structure={id} />
    </KerfProvider>,
  );
  return store;
}

const shelfCut = (s: ReturnType<typeof setup>) =>
  s.getState().solved?.result.cutList.lines.find((l) => l.parts.some((p) => p.name === "Shelf"))
    ?.length;

describe("<SizeFields>", () => {
  it("labels a case Width, Height, Depth with its sizes", () => {
    setup();
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe('36"');
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe('72"');
    expect((screen.getByLabelText("Depth") as HTMLInputElement).value).toBe('12"');
  });

  it('resizes to 30" when typed: shelves 29-1/16" cut', () => {
    const store = setup();
    const width = screen.getByLabelText("Width");
    fireEvent.change(width, { target: { value: '30"' } });
    fireEvent.blur(width);
    expect(shelfCut(store)).toBe(5_905_500);
  });

  it("records one History entry for a 200-step drag, ending on the exact value", () => {
    const store = setup();
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
    for (let i = 1; i <= 200; i += 1)
      fireEvent.pointerMove(label, { clientX: -4 * i, pointerId: 1, altKey: true });
    fireEvent.pointerUp(label, { clientX: -800, pointerId: 1 });
    // 200 Alt steps of 1/64" = 3-1/8" narrower: 32-7/8". Shelf cut = 32-7/8 − 2 × 23/32 + 1/2 = 31-15/16" = 6489700.
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 32-7/8"',
    ]);
    expect(shelfCut(store)).toBe(6_489_700);
  });
});
