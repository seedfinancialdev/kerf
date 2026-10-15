// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §4, "The tour": four tips, each pointing at the real screen, one at a time, with Next
// and Skip tour; Escape or a click elsewhere ends it; it never blocks the screen.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { startProject } from "../model/commands";
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

  it("lets the model be orbited during its own tip, but a press on a tool ends the tour", async () => {
    const { store } = await firstVisit();
    press("Next");
    press("Next");
    // The middle button (1) orbits the model (design spec §4, tip 3; Ruling R30).
    fireEvent.pointerDown(anchor("model"), { button: 1 });
    expect(store.getState().toured).toBe(false);
    press("Next");
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Board/ }));
    expect(store.getState().toured).toBe(true);
  });

  it("clears picked boards for the sizes tip, so the Shape panel with the sizes shows", async () => {
    const store = await workshopStore();
    render(<App store={store} model={null} />);
    const board = store.getState().solved?.result.placements[0]?.instance ?? "";
    act(() => store.getState().select({ kind: "boards", instances: [board] }));
    act(() => store.getState().startTour());
    press("Next");
    expect(store.getState().selection).toEqual({ kind: "none" });
    expect(anchor("sizes").getAttribute("aria-describedby")).toBe(
      tour().getAttribute("aria-describedby"),
    );
  });

  it("opens a closed Size section for the sizes tip", async () => {
    const store = await workshopStore();
    render(<App store={store} model={null} />);
    act(() => store.getState().toggleSection("Size"));
    expect(anchor("sizes")).toBeNull();
    act(() => store.getState().startTour());
    press("Next");
    expect(store.getState().sections.Size).toBe(true);
    expect(anchor("sizes").getAttribute("aria-describedby")).toBe(
      tour().getAttribute("aria-describedby"),
    );
  });

  it("puts the keyboard on Next when it opens, and gives it back to Settings when it ends", async () => {
    const store = await workshopStore();
    render(<App store={store} model={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(document.activeElement).toBe(within(tour()).getByRole("button", { name: "Next" }));
    press("Skip tour");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
  });

  it("leaves the keyboard on the page when it ends on a first visit, where nothing had it", async () => {
    await firstVisit();
    expect(document.activeElement).toBe(within(tour()).getByRole("button", { name: "Next" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(document.body);
  });

  describe("where it sits", () => {
    /** The 1440 × 900 Workshop as the browser lays it out (measured), in pixels. */
    const BOXES = {
      steps: { left: 534, top: 6, width: 318, height: 32 },
      hint: { left: 0, top: 44, width: 1440, height: 32 },
      sizes: { left: 1165, top: 120, width: 251, height: 94 },
      inspector: { left: 1140, top: 76, width: 300, height: 824 },
      model: { left: 232, top: 76, width: 908, height: 571 },
      toolRow: { left: 232, top: 647, width: 908, height: 43 },
      drawer: { left: 232, top: 690, width: 908, height: 210 },
    };
    /** The tip card's own size. */
    const CARD = { width: 280, height: 140 };
    type Shape = { left: number; top: number; width: number; height: number };

    const rect = (box: Shape) =>
      ({
        ...box,
        right: box.left + box.width,
        bottom: box.top + box.height,
        x: box.left,
        y: box.top,
        toJSON: () => box,
      }) as DOMRect;

    /** The box of each element as laid out in `BOXES`; nothing else takes up room. */
    const layOut = (boxes: typeof BOXES = BOXES) => {
      vi.stubGlobal("innerWidth", 1440);
      vi.stubGlobal("innerHeight", 900);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        const tour = this.dataset.tour as keyof typeof BOXES | undefined;
        if (tour && tour in boxes) return rect(boxes[tour]);
        if (this.classList.contains("hint")) return rect(boxes.hint);
        if (this.classList.contains("panel-right")) return rect(boxes.inspector);
        if (this.classList.contains("tool-row")) return rect(boxes.toolRow);
        if (this.classList.contains("tour")) return rect({ left: 0, top: 0, ...CARD });
        return rect({ left: 0, top: 0, width: 0, height: 0 });
      });
    };

    /** True when two boxes share any area. */
    const overlap = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    const cardBox = () =>
      rect({
        left: Number.parseFloat(tour().style.left),
        top: Number.parseFloat(tour().style.top),
        ...CARD,
      });

    // Ruling R29. Gap 6 px (Tip.tsx); a card above or below sits 16 px in from its anchor's start,
    // and one inside the model 16 px in from its corner:
    //   steps  below the hint line: left 534 + 16 = 550, top 44 + 32 + 6 = 82.
    //   sizes  left of the inspector: left 1140 − 6 − 280 = 854, top 120.
    //   model  inside its top-left corner: left 232 + 16 = 248, top 76 + 16 = 92.
    //   drawer above the tool row: left 232 + 16 = 248, top 647 − 6 − 140 = 501.
    const EXPECTED = [
      { left: 550, top: 82 },
      { left: 854, top: 120 },
      { left: 248, top: 92 },
      { left: 248, top: 501 },
    ];

    it("puts each tip where the spec's ruling says", async () => {
      layOut();
      await firstVisit();
      for (const [i, at] of EXPECTED.entries()) {
        expect({ left: cardBox().left, top: cardBox().top }).toEqual(at);
        if (i < EXPECTED.length - 1) press("Next");
      }
    });

    it("covers no tip's part of the screen, nor the hint line, the inspector or the tool row", async () => {
      layOut();
      await firstVisit();
      // The model is left out: tips 2 to 4 sit on it, as a note sits on a drawing (Ruling R29).
      const covered = [
        BOXES.steps,
        BOXES.hint,
        BOXES.sizes,
        BOXES.inspector,
        BOXES.toolRow,
        BOXES.drawer,
      ];
      for (const i of EXPECTED.keys()) {
        for (const box of covered) expect(overlap(cardBox(), rect(box))).toBe(false);
        if (i < EXPECTED.length - 1) press("Next");
      }
    });

    it("points its arrow into the part it is about: up at the steps, right at the sizes, down at the drawer", async () => {
      layOut();
      await firstVisit();
      // The arrow points 20 px into its anchor, no nearer the card's corner than 14 px:
      //   steps  534 + 20 − 550 = 4, so 14.   sizes  120 + 20 − 120 = 20.
      //   model  inside it, so no arrow.       drawer 232 + 20 − 248 = 4, so 14.
      const arrows = [
        ["below", "14px"],
        ["left", "20px"],
        [null, ""],
        ["above", "14px"],
      ];
      for (const [i, [side, at]] of arrows.entries()) {
        expect([
          tour().getAttribute("data-arrow"),
          tour().style.getPropertyValue("--arrow"),
        ]).toEqual([side, at]);
        if (i < arrows.length - 1) press("Next");
      }
    });

    it("sits in the middle of the window, with no arrow, when its part is not on screen", async () => {
      layOut();
      // A project of boards drawn by hand has no sizes to show (ShapeStep.tsx).
      const bookcase = startProject("Bookcase", "imperial").project;
      const store = await workshopStore(
        { label: "Boards only", project: { ...bookcase, structures: [] } },
        { storage: memoryStorage() },
      );
      render(<App store={store} model={null} />);
      press("Next");
      // (1440 − 280) / 2 = 580; (900 − 140) / 2 = 380.
      expect({ left: cardBox().left, top: cardBox().top }).toEqual({ left: 580, top: 380 });
      expect(tour().hasAttribute("data-arrow")).toBe(false);
    });

    it("follows its part of the screen when the window is resized or scrolled", async () => {
      const moved = structuredClone(BOXES);
      layOut(moved);
      await firstVisit();
      // The steps and hint line move down 100 px: below them is 144 + 32 + 6 = 182.
      moved.steps.top += 100;
      moved.hint.top += 100;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(tour().style.top).toBe("182px");
      // And 50 px more on a scroll: 194 + 32 + 6 = 232.
      moved.steps.top += 50;
      moved.hint.top += 50;
      act(() => {
        document.dispatchEvent(new Event("scroll"));
      });
      expect(tour().style.top).toBe("232px");
    });
  });
});
