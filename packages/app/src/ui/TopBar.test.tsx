// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Tooltips": every control has one, including Undo and Redo while there is nothing to undo.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";

describe("<TopBar> tips", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("names Undo while it is disabled, since a disabled button gets no pointer events", () => {
    render(
      <App store={createKerfStore({ storage: createStorage(memoryStorage()) })} model={null} />,
    );
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.hasAttribute("disabled")).toBe(true);
    // The pointer enters the wrapper around the button, which is what a browser reports.
    fireEvent.pointerEnter(undo.parentElement as HTMLElement);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toContain("Take back your last change.");
  });
});
