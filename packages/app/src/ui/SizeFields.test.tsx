// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Review Focus 5 and Operation specs, resize checks (30" → shelves 29-1/16" cut).

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { SizeFields } from "./SizeFields";

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
    // 200 Alt steps of 1/64" = 3-1/8" narrower: 32-7/8". Shelf cut = 32-7/8 − 2 × 23/32 + 1/2 =
    // 31-15/16" = 6489700.
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 32-7/8"',
    ]);
    expect(shelfCut(store)).toBe(6_489_700);
  });

  it("records nothing for a typed size equal to the current one, and shows the size again", () => {
    const store = setup();
    const width = screen.getByLabelText("Width") as HTMLInputElement;
    fireEvent.change(width, { target: { value: '36.0"' } });
    fireEvent.blur(width);
    fireEvent.blur(width);
    expect(store.getState().history?.entries).toHaveLength(1);
    expect(width.value).toBe('36"');
  });

  it("records nothing and leaves no preview when a drag ends where it started", () => {
    const store = setup();
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(label, { clientX: -40, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 1, pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: 1, pointerId: 1 });
    expect(store.getState().history?.entries).toHaveLength(1);
    expect(store.getState().previewed).toBeNull();
  });

  it("drops the preview when the pointer is cancelled mid-drag", () => {
    const store = setup();
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(label, { clientX: -40, pointerId: 1 });
    expect(store.getState().previewed).not.toBeNull();
    fireEvent.pointerCancel(label, { pointerId: 1 });
    expect(store.getState().previewed).toBeNull();
    expect(store.getState().history?.entries).toHaveLength(1);
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe('36"');
  });

  it("keeps the last good preview when a drag step would make the size zero, and records that", () => {
    const store = setup();
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
    // -2300 px = 575 steps of 1/16" = 35-15/16": the width is 1/16" left.
    fireEvent.pointerMove(label, { clientX: -2300, pointerId: 1 });
    // -2400 px = 600 steps = 37-1/2" narrower: below zero, refused; the 1/16" preview stays.
    fireEvent.pointerMove(label, { clientX: -2400, pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: -2400, pointerId: 1 });
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 1/16"',
    ]);
  });

  it("ends a drag when History moves under it, so the release keeps the redo entry", () => {
    const store = setup();
    const width = screen.getByLabelText("Width");
    fireEvent.change(width, { target: { value: '30"' } });
    fireEvent.blur(width);
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(label, { clientX: -40, pointerId: 1 });
    act(() => store.getState().undo());
    fireEvent.pointerMove(label, { clientX: -80, pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: -80, pointerId: 1 });
    // Undo showed New bookcase (36"); the drag after it records nothing, so Redo still has 30".
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      'Width 36" → 30"',
    ]);
    expect(store.getState().history?.at).toBe(0);
    expect(store.getState().previewed).toBeNull();
  });

  describe("a drag that cannot go on (silent-failure review M9)", () => {
    it("says why under the field when it reaches a size that is refused", () => {
      setup();
      const label = screen.getByText("Width");
      fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
      // Shift steps are 1" (ADR 015, rule 2): 36 steps left reach 36" − 36" = 0, which is refused.
      fireEvent.pointerMove(label, { clientX: -4 * 36, pointerId: 1, shiftKey: true });
      expect(document.querySelector(".field-problem")?.textContent).toBe(
        "Width must be more than zero.",
      );
    });

    it("drops its preview when the field goes away mid-drag", () => {
      const store = createKerfStore({ storage: createStorage(memoryStorage()) });
      store.getState().apply(startProject("Bookcase", "imperial"));
      const id = shownProject(store.getState())?.structures[0]?.id ?? "";
      const view = render(
        <KerfProvider store={store}>
          <SizeFields structure={id} />
        </KerfProvider>,
      );
      const label = screen.getByText("Width");
      fireEvent.pointerDown(label, { clientX: 0, pointerId: 1, button: 0 });
      fireEvent.pointerMove(label, { clientX: -40, pointerId: 1 });
      expect(store.getState().previewed).not.toBeNull();
      view.unmount();
      expect(store.getState().previewed).toBeNull();
    });
  });
});
