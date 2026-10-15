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
/** Focus as Tab gives it: a key press first, so the focus counts as keyboard focus. */
function tabTo(element: HTMLElement) {
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => element.focus());
}

const move = { name: "Move", key: "M", text: "Move or copy the boards you picked." };

describe("Tip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("shows on keyboard focus and hides on Escape", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    tabTo(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows for keyboard focus on a control inside the wrapped element", () => {
    render(
      <Tip tip={pushPull}>
        <span>
          <button type="button">Push/Pull</button>
        </span>
      </Tip>,
    );
    tabTo(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("hides when focus leaves the control", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    tabTo(screen.getByRole("button"));
    act(() => screen.getByRole("button").blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not pop at once for focus that is not from the keyboard", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    // jsdom reports every focus() as keyboard focus, so say what a browser says after a mouse press.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" ? false : matches.call(this, selector);
    });
    act(() => screen.getByRole("button").focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides on a mouse press, and a press cancels a tip still waiting to show", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerEnter(button);
    fireEvent.pointerDown(button, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole("tooltip")).toBeNull();
    tabTo(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(button, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows after a 500 ms touch press and stays after the finger lifts, until the next tap", () => {
    render(
      <>
        <Tip tip={pushPull}>
          <button type="button">Push/Pull</button>
        </Tip>
        <p>elsewhere</p>
      </>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.pointerLeave(button, { pointerType: "touch" });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("elsewhere"), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not show for a touch that lifts before half a second", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("leaves the wrapped control's own click, pointer-down and ref working", () => {
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const ref = vi.fn();
    render(
      <Tip tip={pushPull}>
        <button type="button" onClick={onClick} onPointerDown={onPointerDown} ref={ref}>
          Push/Pull
        </button>
      </Tip>,
    );
    fireEvent.pointerDown(screen.getByRole("button"), { pointerType: "mouse" });
    fireEvent.click(screen.getByRole("button"));
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledWith(screen.getByRole("button"));
  });

  it("hides when the page scrolls or resizes", () => {
    render(
      <Tip tip={pushPull}>
        <button type="button">Push/Pull</button>
      </Tip>,
    );
    tabTo(screen.getByRole("button"));
    fireEvent.scroll(window);
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => screen.getByRole("button").blur());
    tabTo(screen.getByRole("button"));
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  describe("placement", () => {
    // The window is 1000 x 700; the tip is 200 x 50; the control is the box each test sets.
    const place = (control: { left: number; top: number; bottom: number }) => {
      vi.stubGlobal("innerWidth", 1000);
      vi.stubGlobal("innerHeight", 700);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        const box = this.classList.contains("tip")
          ? { left: 0, top: 0, bottom: 50, width: 200, height: 50 }
          : { ...control, width: 40, height: control.bottom - control.top };
        return {
          ...box,
          right: box.left + box.width,
          x: box.left,
          y: box.top,
          toJSON: () => box,
        } as DOMRect;
      });
      render(
        <Tip tip={pushPull}>
          <button type="button">Push/Pull</button>
        </Tip>,
      );
      tabTo(screen.getByRole("button"));
      return screen.getByRole("tooltip");
    };
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("sits 6 px below its control, level with its left edge", () => {
      const tip = place({ left: 100, top: 20, bottom: 50 });
      // left 100 fits (100 + 200 <= 992); top = 50 + 6.
      expect([tip.style.left, tip.style.top]).toEqual(["100px", "56px"]);
    });

    it("moves left to stay inside the window, 8 px from the edge", () => {
      const tip = place({ left: 950, top: 20, bottom: 50 });
      // 1000 - 200 - 8 = 792.
      expect(tip.style.left).toBe("792px");
    });

    it("flips above the control when it would run off the bottom", () => {
      const tip = place({ left: 100, top: 660, bottom: 690 });
      // Below would end at 690 + 6 + 50 = 746 > 700; above: 660 - 6 - 50 = 604.
      expect(tip.style.top).toBe("604px");
    });
  });
});
