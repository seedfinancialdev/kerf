// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Tooltips": after about half a second of hover; at once when moving straight to a neighbour;
// on keyboard focus; the tip names the control, its key and what it does.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tip } from "./Tip";

const pushPull = {
  name: "Push/Pull",
  key: "P",
  text: "Stretch or shrink a board by dragging one of its ends.",
};
const move = { name: "Move", key: "M", text: "Move or copy the boards you picked." };

describe("Tip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows after half a second of hover, with name, key and what it does", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    fireEvent.pointerEnter(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip").textContent).toBe(
      "Push/PullPStretch or shrink a board by dragging one of its ends.",
    );
    expect(screen.getByRole("button").getAttribute("aria-describedby")).toBe(
      screen.getByRole("tooltip").id,
    );
  });

  it("shows a neighbour's tip at once when the pointer moves straight to it", () => {
    render(
      <>
        <Tip tip={pushPull}>
          <button type="button">Push/Pull</button>
        </Tip>
        <Tip tip={move}>
          <button type="button">Move</button>
        </Tip>
      </>,
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Push/Pull" }));
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerLeave(screen.getByRole("button", { name: "Push/Pull" }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByRole("tooltip").textContent).toContain("Move or copy");
  });

  it("shows on keyboard focus and hides on blur and Escape", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
