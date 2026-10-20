// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, §1 "Your shop (the pegboard)": tap a card to hang it, a hung tool shows its settings,
// a count of what is hung, and "Skip for now" (the starter shop, asked about later) or "That's my
// shop" (ADR 016, D3). Nothing is saved until one of the two is pressed.

import { INCH } from "@kerf/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STARTER_RECORD } from "../../model/shop-record";
import { createStorage } from "../../model/storage";
import { createKerfStore } from "../../model/store";
import { KerfProvider } from "../../state/useKerf";
import { bannedWordsIn } from "../../testing/banned-words";
import { memoryLibrary } from "../../testing/memory-library";
import { memoryStorage } from "../../testing/memory-storage";
import { YourShop } from "./YourShop";

/** Every card, in the order the wall shows them (design spec, §1, the table of rows). */
const CARDS = [
  "Table saw",
  "Dado stack",
  "Router",
  "Track saw",
  "Drill / driver",
  "Chisels",
  "Dovetail saw",
  "3/4 plywood",
  "1/4 plywood",
  "4/4 walnut",
  "Add your own",
];

/** The starter shop (`STARTER_RECORD`): five tools and the three starter woods. */
const STARTER_HUNG = [
  "Table saw",
  "Dado stack",
  "Router",
  "Chisels",
  "Dovetail saw",
  "3/4 plywood",
  "1/4 plywood",
  "4/4 walnut",
];

/** Your shop at first launch, on a fresh browser, or on what `backing` already keeps. */
function firstLaunch(backing: Storage = memoryStorage()) {
  const store = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
  render(
    <KerfProvider store={store}>
      <YourShop />
    </KerfProvider>,
  );
  return store;
}

/** A card's button: its name is the card's name followed by what the thing is for. */
const card = (name: string): HTMLElement =>
  screen.getByRole("button", { name: (n) => n === name || n.startsWith(`${name} `) });

/** Everything on one card: the button and, once hung, its settings. */
const onCard = (name: string) => within(card(name).closest("li") as HTMLElement);

const pressed = (name: string): boolean => card(name).getAttribute("aria-pressed") === "true";

const countLine = (): string =>
  screen.getByText((_, el) => el?.className === "shop-count").textContent ?? "";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("<YourShop>", () => {
  it("makes every card a toggle button, and Add your own a button that opens its form", () => {
    firstLaunch();
    for (const name of CARDS.filter((c) => c !== "Add your own")) {
      expect(card(name).tagName).toBe("BUTTON");
      expect(card(name).hasAttribute("aria-pressed")).toBe(true);
    }
    expect(card("Add your own").getAttribute("aria-expanded")).toBe("false");
  });

  it("hangs the starter shop at first launch and counts it", () => {
    firstLaunch();
    expect(CARDS.filter(pressed)).toEqual(STARTER_HUNG);
    // Five tools and three woods.
    expect(countLine()).toBe("8 things on your wall");
  });

  it("hangs the track saw on a tap and shows its blade choice", () => {
    firstLaunch();
    expect(onCard("Track saw").queryByLabelText("Blade")).toBeNull();
    fireEvent.click(card("Track saw"));
    expect(pressed("Track saw")).toBe(true);
    expect(onCard("Track saw").getByLabelText("Blade")).toBeTruthy();
    expect(countLine()).toBe("9 things on your wall");
  });

  it("saves nothing until a choice at the bottom is made", () => {
    const store = firstLaunch();
    fireEvent.click(card("Drill / driver"));
    expect(store.getState().shopRecord).toEqual(STARTER_RECORD);
  });

  it("saves the shop as hung with That's my shop, and goes Home", () => {
    const store = firstLaunch();
    fireEvent.click(card("Track saw"));
    fireEvent.click(card("Drill / driver"));
    fireEvent.click(card("Chisels"));
    fireEvent.click(card("1/4 plywood"));
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    const record = store.getState().shopRecord;
    expect(record).toEqual({
      ...STARTER_RECORD,
      setUp: true,
      // A newly hung track saw starts on a standard 1/8" blade.
      trackSaw: { kerf: INCH / 8 },
      drill: true,
      chisels: false,
      stock: STARTER_RECORD.stock.filter((s) => s.name !== "1/4 plywood"),
    });
    expect(store.getState().screen).toBe("home");
  });

  it("keeps the starter shop with Skip for now, asks later, and opens Home next time", () => {
    const backing = memoryStorage();
    const store = firstLaunch(backing);
    fireEvent.click(card("Drill / driver"));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(store.getState().shopRecord).toEqual({ ...STARTER_RECORD, setUp: false });
    expect(store.getState().screen).toBe("home");
    const nextLaunch = createKerfStore({
      storage: createStorage(backing),
      library: memoryLibrary(),
    });
    expect(nextLaunch.getState().screen).toBe("home");
  });

  it("offers Cancel on a shop already set up, which leaves it as it was", () => {
    const backing = memoryStorage();
    const mine = { ...STARTER_RECORD, setUp: true, drill: true };
    backing.setItem("kerf.shop", JSON.stringify(mine));
    const store = firstLaunch(backing);
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    fireEvent.click(card("Drill / driver"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.getState().shopRecord).toEqual(mine);
    expect(store.getState().screen).toBe("home");
  });

  it("cuts to a thin-kerf blade's width", async () => {
    const store = firstLaunch();
    await userEvent.selectOptions(onCard("Table saw").getByLabelText("Blade"), 'Thin kerf (3/32")');
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    // 3/32" = 3 × 203200 / 32 = 19,050.
    expect(store.getState().shop.kerf).toBe(19_050);
  });

  it("takes a blade width typed under Other", async () => {
    const store = firstLaunch();
    await userEvent.selectOptions(onCard("Table saw").getByLabelText("Blade"), "Other");
    await userEvent.clear(onCard("Table saw").getByLabelText("Blade width"));
    await userEvent.type(onCard("Table saw").getByLabelText("Blade width"), '1/16"{Enter}');
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    // 1/16" = 203200 / 16 = 12,700.
    expect(store.getState().shop.kerf).toBe(12_700);
  });

  it("keeps an odd blade exactly when its Other field is tabbed through unchanged", async () => {
    const backing = memoryStorage();
    // 0.1" = 203200 / 10 = 20,320, which the field shows to the nearest 1/64" as 3/32" (19,050).
    const odd = { ...STARTER_RECORD, setUp: true, tableSaw: { kerf: 20_320 } };
    backing.setItem("kerf.shop", JSON.stringify(odd));
    const store = firstLaunch(backing);
    onCard("Table saw").getByLabelText("Blade width").focus();
    await userEvent.tab();
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    expect(store.getState().shopRecord.tableSaw).toEqual({ kerf: 20_320 });
  });

  it("keeps a 1/8 blade exactly when Other is chosen and tabbed through in metric", async () => {
    const backing = memoryStorage();
    backing.setItem("kerf.units", "metric");
    const store = firstLaunch(backing);
    // The field shows 1/8" (25,400) to the nearest 0.1 mm: 3.175 mm reads "3.2 mm" (25,600).
    await userEvent.selectOptions(onCard("Table saw").getByLabelText("Blade"), "Other");
    expect(onCard("Table saw").getByLabelText("Blade width")).toHaveProperty("value", "3.2 mm");
    await userEvent.tab();
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    expect(store.getState().shopRecord.tableSaw).toEqual({ kerf: INCH / 8 });
  });

  it("refuses a blade of no width and says why", async () => {
    firstLaunch();
    await userEvent.selectOptions(onCard("Table saw").getByLabelText("Blade"), "Other");
    await userEvent.clear(onCard("Table saw").getByLabelText("Blade width"));
    await userEvent.type(onCard("Table saw").getByLabelText("Blade width"), '0"{Enter}');
    expect(onCard("Table saw").getByText("A blade must be wider than zero.")).toBeTruthy();
  });

  it("brings a tool's settings back when it is hung again", async () => {
    const store = firstLaunch();
    await userEvent.selectOptions(onCard("Dado stack").getByLabelText("Widest cut"), '1/2"');
    fireEvent.click(card("Dado stack"));
    fireEvent.click(card("Dado stack"));
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    // 1/2" = 101,600.
    expect(store.getState().shopRecord.dadoStack).toEqual({ maxWidth: INCH / 2 });
  });

  it("adds a router bit from the router card", () => {
    const store = firstLaunch();
    fireEvent.click(onCard("Router").getByRole("button", { name: "Edit bits" }));
    const roundover = screen.getByRole("group", { name: "Roundover" });
    fireEvent.click(within(roundover).getByRole("button", { name: '3/8"' }));
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    // The starter 1/8" roundover (25,400) and the 3/8" one (3 × 203200 / 8 = 76,200).
    expect(store.getState().shopRecord.router?.bits).toEqual([
      { shape: "roundover", size: 25_400 },
      { shape: "roundover", size: 76_200 },
    ]);
  });

  it("adds a wood of your own, hung", async () => {
    const store = firstLaunch();
    fireEvent.click(card("Add your own"));
    await userEvent.type(screen.getByLabelText("Name"), "8/4 maple");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    await userEvent.type(screen.getByLabelText("Thickness"), '1-3/4"');
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(pressed("8/4 maple")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    const maple = store.getState().shopRecord.stock.at(-1);
    // 1-3/4" = 7 × 203200 / 4 = 355,600.
    expect(maple).toMatchObject({ name: "8/4 maple", kind: "solid", thickness: 355_600 });
  });

  it("refuses a wood of your own with no name or no thickness", async () => {
    firstLaunch();
    fireEvent.click(card("Add your own"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Give the wood a name.")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Name"), "Baltic birch");
    await userEvent.type(screen.getByLabelText("Thickness"), '0"');
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Thickness must be more than zero.")).toBeTruthy();
  });

  it("closes the bits panel on Escape while Edit bits has the focus", async () => {
    firstLaunch();
    await userEvent.click(onCard("Router").getByRole("button", { name: "Edit bits" }));
    expect(screen.getByRole("dialog", { name: "Router bits" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Router bits" })).toBeNull();
  });

  it("says plainly when a bit size typed under + Add a size cannot be read", async () => {
    firstLaunch();
    fireEvent.click(onCard("Router").getByRole("button", { name: "Edit bits" }));
    const roundover = within(screen.getByRole("group", { name: "Roundover" }));
    fireEvent.click(roundover.getByRole("button", { name: "+ Add a size" }));
    await userEvent.type(roundover.getByLabelText("Roundover size"), "big{Enter}");
    // The wording every size field uses (model/size.ts, explainSize; Task 10 review).
    expect(
      roundover.getByText('Roundover size: "big" isn\'t a length; type one like 30" or 762 mm.'),
    ).toBeTruthy();
  });

  it("says plainly when a wood's thickness cannot be read", async () => {
    firstLaunch();
    fireEvent.click(card("Add your own"));
    await userEvent.type(screen.getByLabelText("Name"), "Baltic birch");
    await userEvent.type(screen.getByLabelText("Thickness"), "thick");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(
      'Thickness: "thick" isn\'t a length; type one like 30" or 762 mm.',
    );
  });

  it("gives the focus back to Add your own when the wood form closes", async () => {
    firstLaunch();
    await userEvent.click(card("Add your own"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(card("Add your own"));
    await userEvent.click(card("Add your own"));
    await userEvent.type(screen.getByLabelText("Name"), "Oak");
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(card("Add your own"));
  });

  it("keeps a wood of your own after That's my shop, on the next launch", async () => {
    const backing = memoryStorage();
    firstLaunch(backing);
    fireEvent.click(card("Add your own"));
    await userEvent.type(screen.getByLabelText("Name"), "8/4 maple");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    await userEvent.type(screen.getByLabelText("Thickness"), '1-3/4"');
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "That's my shop" }));
    cleanup();
    const nextLaunch = firstLaunch(backing);
    // 1-3/4" = 7 × 203200 / 4 = 355,600.
    expect(nextLaunch.getState().shopRecord.stock.at(-1)).toMatchObject({
      name: "8/4 maple",
      kind: "solid",
      thickness: 355_600,
    });
    expect(pressed("8/4 maple")).toBe(true);
  });

  it("puts a hung card's tip above it, off the settings below the card", () => {
    vi.useFakeTimers();
    // A 1000 x 700 window, a 200 x 50 tip, and every other box at 300-400 px down the window.
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 700);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const box = this.classList.contains("tip")
        ? { left: 0, top: 0, width: 200, height: 50 }
        : { left: 100, top: 300, width: 160, height: 100 };
      return { ...box, right: box.left + box.width, bottom: box.top + box.height } as DOMRect;
    });
    firstLaunch();
    const tipTop = (name: string): string => {
      fireEvent.pointerEnter(card(name));
      act(() => vi.advanceTimersByTime(500));
      const top = screen.getByRole("tooltip").style.top;
      fireEvent.pointerLeave(card(name));
      return top;
    };
    // Hung, with its blade below: above the card, 300 - 6 - 50 = 244.
    expect(tipTop("Table saw")).toBe("244px");
    // Not hung, nothing below it: below the card, 400 + 6 = 406.
    expect(tipTop("Track saw")).toBe("406px");
  });

  it("speaks shop language", () => {
    firstLaunch();
    fireEvent.click(card("Track saw"));
    fireEvent.click(onCard("Router").getByRole("button", { name: "Edit bits" }));
    expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
  });

  it("says on every card what hanging it lets Kerf do", () => {
    vi.useFakeTimers();
    firstLaunch();
    for (const name of CARDS) {
      fireEvent.pointerEnter(card(name));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole("tooltip").textContent, name).toMatch(/\w+\.$/);
      fireEvent.pointerLeave(card(name));
    }
    fireEvent.pointerEnter(card("Dado stack"));
    expect(screen.getByRole("tooltip").textContent).toContain("Lets Kerf use dados for shelves.");
  });

  it("reaches every card with Tab, in order, and toggles one with Space", async () => {
    firstLaunch();
    const reached: string[] = [];
    for (let i = 0; i < 40 && reached.length < CARDS.length; i += 1) {
      await userEvent.tab();
      const name = CARDS.find((c) => document.activeElement === card(c));
      if (name) reached.push(name);
    }
    expect(reached).toEqual(CARDS);
    card("Drill / driver").focus();
    await userEvent.keyboard(" ");
    expect(pressed("Drill / driver")).toBe(true);
  });
});
