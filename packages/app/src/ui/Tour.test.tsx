// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §4, "The tour": four tips, each pointing at the real screen, one at a time, with Next
// and Skip tour; Escape or a click elsewhere ends it; it never blocks the screen.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryStorage } from "../testing/memory-storage";
import { workshopStore } from "../testing/workshop-store";

/** The four tips' words, copied from design spec §4, in order. */
const WORDS = [
  "These four steps take your piece from shape to cut list.",
  "Type a size, or drag its label to adjust it. Any unit works.",
  "Orbit with the middle mouse button or two fingers. The tools work like SketchUp's: P to push or pull, M to move, T to measure.",
  "Your shopping list, cut list, sheets and assembly steps live here, always up to date.",
];

/** The part of the screen each tip points at, by its `data-tour` name, in order. */
const ANCHORS = ["steps", "sizes", "model", "drawer"];

/** The Workshop on a first visit (the tour not yet seen), over the browser storage `backing`. */
async function firstVisit(backing = memoryStorage()) {
  const store = await workshopStore(undefined, { storage: backing });
  render(<App store={store} model={null} />);
  return { store, backing };
}

const tour = () => screen.getByRole("dialog", { name: /^Tour/ });
const press = (name: string) => fireEvent.click(within(tour()).getByRole("button", { name }));
const anchor = (name: string) => document.querySelector(`[data-tour="${name}"]`) as HTMLElement;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("<Tour>", () => {
  it("shows tip 1 of 4 on the steps the first time the Workshop opens, describing them", async () => {
    await firstVisit();
    expect(tour().getAttribute("aria-label")).toBe("Tour, step 1 of 4");
    expect(tour().getAttribute("aria-modal")).toBe("false");
    const steps = screen.getByRole("navigation", { name: "Workflow" });
    expect(steps.dataset.tour).toBe("steps");
    const said = document.getElementById(steps.getAttribute("aria-describedby") ?? "");
    expect(said?.textContent).toBe(WORDS[0]);
  });

  it("does not show for a returning user who has seen it", async () => {
    const store = await workshopStore();
    render(<App store={store} model={null} />);
    expect(screen.queryByRole("dialog", { name: /^Tour/ })).toBeNull();
  });

  it("walks tips 2 to 4 with Next, each in the spec's words on its own part of the screen, and ends on Done", async () => {
    await firstVisit();
    for (const [i, words] of WORDS.entries()) {
      expect(tour().getAttribute("aria-label")).toBe(`Tour, step ${i + 1} of 4`);
      const on = anchor(ANCHORS[i] as string);
      expect(document.getElementById(on.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
        words,
      );
      const last = i === WORDS.length - 1;
      expect(within(tour()).queryByRole("button", { name: "Next" }) === null).toBe(last);
      expect(within(tour()).queryByRole("button", { name: "Done" }) === null).toBe(!last);
      if (!last) press("Next");
    }
  });

  it("offers Back from tip 2 on, which shows the tip before and leaves the old part undescribed", async () => {
    await firstVisit();
    expect(within(tour()).queryByRole("button", { name: "Back" })).toBeNull();
    press("Next");
    press("Back");
    expect(tour().getAttribute("aria-label")).toBe("Tour, step 1 of 4");
    expect(anchor("sizes").hasAttribute("aria-describedby")).toBe(false);
  });

  const endings: [string, () => void][] = [
    [
      "Done on the last tip",
      () => {
        for (let i = 0; i < 3; i++) press("Next");
        press("Done");
      },
    ],
    ["Skip tour", () => press("Skip tour")],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ["a click elsewhere", () => fireEvent.pointerDown(screen.getByRole("main"))],
  ];

  it.each(endings)("ends with %s, and does not show again on a later visit", async (_, end) => {
    const { store, backing } = await firstVisit();
    end();
    expect(screen.queryByRole("dialog", { name: /^Tour/ })).toBeNull();
    expect(store.getState().toured).toBe(true);
    expect(anchor("steps").hasAttribute("aria-describedby")).toBe(false);
    const later = await workshopStore(undefined, { storage: backing });
    expect(later.getState().toured).toBe(true);
  });

  it("stays open when a click lands on the tip itself", async () => {
    const { store } = await firstVisit();
    fireEvent.pointerDown(within(tour()).getByText(WORDS[0] as string));
    expect(store.getState().toured).toBe(false);
    expect(tour()).toBeTruthy();
  });

  it("switches to Shape for the sizes tip when it was started on another step", async () => {
    const store = await workshopStore();
    render(<App store={store} model={null} />);
    act(() => store.getState().setStep("Joinery"));
    act(() => store.getState().startTour());
    press("Next");
    expect(store.getState().step).toBe("Shape");
    expect(
      document.getElementById(anchor("sizes").getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe(WORDS[1]);
  });

  it("reads in order (where it is, the words, then Skip tour, Back and Next) and in shop language", async () => {
    await firstVisit();
    press("Next");
    expect(tour().textContent).toBe(`2 of 4${WORDS[1]}Skip tourBackNext`);
    expect(bannedWordsIn(WORDS.join(" "))).toEqual([]);
    expect(bannedWordsIn(tour().textContent ?? "")).toEqual([]);
  });

  describe("where it sits", () => {
    /** A 1440 × 900 window laid out as the Workshop is, in pixels. */
    const BOXES: Record<string, { left: number; top: number; width: number; height: number }> = {
      steps: { left: 520, top: 8, width: 400, height: 32 },
      sizes: { left: 1152, top: 140, width: 276, height: 150 },
      model: { left: 232, top: 76, width: 908, height: 480 },
      drawer: { left: 232, top: 600, width: 908, height: 300 },
    };
    /** The inspector the sizes are in, along the window's right edge. */
    const INSPECTOR = { left: 1140, top: 76, width: 300, height: 824 };
    /** The tip card's own size. */
    const CARD = { width: 280, height: 140 };

    const rect = (box: { left: number; top: number; width: number; height: number }) =>
      ({
        ...box,
        right: box.left + box.width,
        bottom: box.top + box.height,
        x: box.left,
        y: box.top,
        toJSON: () => box,
      }) as DOMRect;

    /** True when two boxes share any area. */
    const overlap = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    // Gap 6 px between the card and what it points at (Tip.tsx), 8 px from the window's edge:
    //   steps  below: top 8 + 32 + 6 = 46, left 520.
    //   sizes  left of the inspector: left 1140 − 6 − 280 = 854, top 140.
    //   model  right: left 232 + 908 + 6 = 1146 (1146 + 280 = 1426 ≤ 1440 − 8), top 76.
    //   drawer above: top 600 − 6 − 140 = 454, left 232.
    const EXPECTED = [
      { left: 520, top: 46 },
      { left: 854, top: 140 },
      { left: 1146, top: 76 },
      { left: 232, top: 454 },
    ];

    it("puts each tip beside its part of the screen, never over it, and the sizes' tip clear of the inspector", async () => {
      vi.stubGlobal("innerWidth", 1440);
      vi.stubGlobal("innerHeight", 900);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        const named = this.dataset.tour ? BOXES[this.dataset.tour] : undefined;
        if (named) return rect(named);
        if (this.classList.contains("panel-right")) return rect(INSPECTOR);
        if (this.classList.contains("tour")) return rect({ left: 0, top: 0, ...CARD });
        return rect({ left: 0, top: 0, width: 0, height: 0 });
      });
      await firstVisit();
      for (const [i, at] of EXPECTED.entries()) {
        const card = rect({
          left: Number.parseFloat(tour().style.left),
          top: Number.parseFloat(tour().style.top),
          ...CARD,
        });
        expect({ left: card.left, top: card.top }).toEqual(at);
        expect(overlap(card, rect(BOXES[ANCHORS[i] as string] as DOMRect))).toBe(false);
        if (ANCHORS[i] === "sizes") expect(overlap(card, rect(INSPECTOR))).toBe(false);
        if (i < EXPECTED.length - 1) press("Next");
      }
    });

    it("follows its part of the screen when the window is resized or scrolled", async () => {
      vi.stubGlobal("innerWidth", 1440);
      vi.stubGlobal("innerHeight", 900);
      let stepsTop = 8;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.dataset.tour === "steps")
          return rect({ ...BOXES.steps, top: stepsTop } as DOMRect);
        if (this.classList.contains("tour")) return rect({ left: 0, top: 0, ...CARD });
        return rect({ left: 0, top: 0, width: 0, height: 0 });
      });
      await firstVisit();
      // The steps move down 100 px: below them is 108 + 32 + 6 = 146.
      stepsTop = 108;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(tour().style.top).toBe("146px");
      // And 50 px more on a scroll: 158 + 32 + 6 = 196.
      stepsTop = 158;
      act(() => {
        document.dispatchEvent(new Event("scroll"));
      });
      expect(tour().style.top).toBe("196px");
    });
  });
});
