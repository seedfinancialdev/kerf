// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The labels the end-to-end test uses: Radius (options from the shop's bits) and "Both front
// edges".

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setShelves, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { EdgePanel } from "./EdgePanel";
import { Inspector } from "./Inspector";

function setup(boards = "Shelf") {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  store.getState().apply(startProject("Bookcase", "imperial"));
  store.getState().setStep("Joinery");
  const shelves =
    store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === boards)
      .map((p) => p.instance) ?? [];
  store.getState().select({ kind: "boards", instances: shelves });
  store.getState().setTool("edge");
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("<EdgePanel>", () => {
  it("offers the shop's roundover bits as radii", () => {
    setup();
    const radius = screen.getByLabelText("Radius") as HTMLSelectElement;
    expect([...radius.options].map((o) => o.textContent)).toEqual(["None", '1/8"']);
  });

  it("rounds both front edges of the shelves with the chosen bit", () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "25400" } });
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(shownProject(store.getState())?.structures[0]?.options.shelfRoundover).toBe("3.175mm");
  });

  it("tells the user, with Undo, that the Top it rounded is now custom", () => {
    const store = setup("Top");
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(store.getState().notice).toEqual({
      text: "Top is now custom; the form won't change it.",
      kind: "undo",
    });
  });

  it("tells the user before they press it that Both front edges changes every shelf the form makes", () => {
    const store = setup();
    const { selection } = store.getState();
    if (selection.kind !== "boards") throw new Error("no shelves picked");
    // One shelf picked: the roundover is still the form's, for all four (ADR 015, D3).
    act(() =>
      store.getState().select({ kind: "boards", instances: selection.instances.slice(0, 1) }),
    );
    expect(
      screen.getByText(
        "Both front edges rounds every shelf the form makes, so they keep following it.",
      ),
    ).toBeTruthy();
  });

  it("says nothing about every shelf when the pick is not the form's shelves", () => {
    setup("Top");
    expect(screen.queryByText(/every shelf the form makes/)).toBeNull();
  });

  it("rounds the ticked edges", () => {
    const store = setup("Top");
    fireEvent.click(screen.getByLabelText("Back edge, show face"));
    fireEvent.click(screen.getByRole("button", { name: "Round the ticked edges" }));
    expect(shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops).toMatchObject([
      { type: "roundover", edges: ["edge0/face1"], radius: "3.175mm" },
    ]);
  });

  it("says so, and records nothing, when None is chosen for a board with no roundover", () => {
    const store = setup("Top");
    const before = shownProject(store.getState());
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
    expect(store.getState().notice?.text).toBe("There's no roundover on those edges to remove.");
    expect(shownProject(store.getState())).toBe(before);
  });

  describe("when the shop's bits change while the panel is open", () => {
    const IN = 203_200;
    const withBits = (store: ReturnType<typeof setup>, roundoverBits: number[]) =>
      act(() =>
        store.getState().setShopRecord({
          ...store.getState().shopRecord,
          router: { bits: roundoverBits.map((size) => ({ shape: "roundover" as const, size })) },
        }),
      );

    it("offers the shop's first bit once the chosen one is taken out of the shop, and rounds with it", () => {
      const store = setup("Top");
      withBits(store, [IN / 8, IN / 4]);
      fireEvent.change(screen.getByLabelText("Radius"), { target: { value: String(IN / 4) } });
      withBits(store, [IN / 8]);
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe(String(IN / 8));
      fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
      // 1/8" = 25400 units = 3.175 mm, the only bit left in the shop.
      expect(
        shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops,
      ).toMatchObject([{ type: "roundover", radius: "3.175mm" }]);
    });

    it("offers the first bit a shop with none gains, so Both front edges rounds with it", () => {
      const store = setup("Top");
      withBits(store, []);
      cleanup();
      render(
        <KerfProvider store={store}>
          <Inspector />
        </KerfProvider>,
      );
      withBits(store, [IN / 8]);
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe(String(IN / 8));
      fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
      expect(
        shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops,
      ).toMatchObject([{ type: "roundover", radius: "3.175mm" }]);
    });

    it("keeps None when the user chose it, whatever bits the shop has", () => {
      const store = setup("Top");
      fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "" } });
      withBits(store, [IN / 8, IN / 4]);
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe("");
    });
  });

  it("says why a board cannot be taken over, and leaves the project alone", () => {
    // A pick made while the row had four shelves; the form now makes two, so shelf 4 is gone.
    const store = setup();
    const shelves = store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === "Shelf");
    const gone = shelves?.[3];
    const project = shownProject(store.getState());
    const structure = project?.structures[0];
    if (!gone || !project || !structure) throw new Error("no shelves to pick");
    const fewer = setShelves(project, structure.id, structure.openings[0]?.id ?? "", "2", "even");
    if (!fewer.ok) throw new Error(fewer.message);
    act(() => store.getState().apply(fewer.edit));
    const before = shownProject(store.getState());
    cleanup();
    render(
      <KerfProvider store={store}>
        <EdgePanel placed={[gone]} />
      </KerfProvider>,
    );
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "25400" } });
    fireEvent.click(screen.getByLabelText("Back edge, show face"));
    fireEvent.click(screen.getByRole("button", { name: "Round the ticked edges" }));
    expect(store.getState().notice?.text).toMatch(/no copy 4 of/i);
    expect(shownProject(store.getState())).toBe(before);
  });

  // Design spec, "Router bits and edge shapes"; ADR 016, D7; Ruling R26: the shapes owned first,
  // the common roundovers without a bit greyed with a reason and an offer, chamfer, cove and ogee
  // later.
  describe("the shapes it offers", () => {
    const THREE_EIGHTHS = 76_200; // 3/8" = 3 × 203200 / 8
    const ADD_QUESTION = 'Add a 3/8" roundover bit to your shop?';
    const NO_BIT = '3/8" roundover, not in your shop. Press to add it.';
    /**
     * The tip a pointer resting on `element` shows (after the half second, design spec "Tooltips").
     */
    const tipOver = (element: Element): string | null => {
      vi.useFakeTimers();
      try {
        fireEvent.pointerEnter(element, { pointerType: "mouse" });
        act(() => vi.advanceTimersByTime(500));
        return screen.getByRole("tooltip").textContent;
      } finally {
        fireEvent.pointerLeave(element, { pointerType: "mouse" });
        vi.useRealTimers();
      }
    };
    /** Focus as Tab gives it: a key press first, so the focus counts as keyboard focus. */
    const tabTo = (element: HTMLElement) => {
      fireEvent.keyDown(document.body, { key: "Tab" });
      act(() => element.focus());
    };

    it('uses the 1/8" roundover the shop owns at once, without asking', () => {
      const store = setup("Top");
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe("25400");
      fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
      expect(screen.queryByText(/to your shop\?/)).toBeNull();
      expect(
        shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops,
      ).toMatchObject([{ type: "roundover", radius: "3.175mm" }]);
    });

    it('names a 3/8" roundover the shop has no bit for as not in the shop, and says why in its tip', () => {
      setup("Top");
      const greyed = screen.getByRole("button", { name: NO_BIT });
      expect(greyed.textContent).toBe('3/8" roundover');
      const tip = tipOver(greyed);
      expect(tip).toContain('Needs a 3/8" roundover bit.');
      expect(bannedWordsIn(tip ?? "")).toEqual([]);
    });

    it("adds the bit on Yes, says so, and rounds with it", () => {
      const store = setup("Top");
      fireEvent.click(screen.getByRole("button", { name: NO_BIT }));
      expect(screen.getByText(ADD_QUESTION)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Yes, add it" }));
      expect(store.getState().shopRecord.router?.bits).toContainEqual({
        shape: "roundover",
        size: THREE_EIGHTHS,
      });
      expect(screen.queryByText(ADD_QUESTION)).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(
        'Added a 3/8" roundover bit to your shop.',
      );
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe(
        String(THREE_EIGHTHS),
      );
      fireEvent.click(screen.getByRole("button", { name: "Both front edges" }));
      // 3/8" = 9.525 mm.
      expect(
        shownProject(store.getState())?.parts.find((d) => d.name === "Top")?.ops,
      ).toMatchObject([{ type: "roundover", radius: "9.525mm" }]);
    });

    it("leaves the shop and the radius alone on No", () => {
      const store = setup("Top");
      const before = store.getState().shopRecord;
      fireEvent.click(screen.getByRole("button", { name: NO_BIT }));
      fireEvent.click(screen.getByRole("button", { name: "No" }));
      expect(screen.queryByText(ADD_QUESTION)).toBeNull();
      expect(store.getState().shopRecord).toBe(before);
      expect((screen.getByLabelText("Radius") as HTMLSelectElement).value).toBe("25400");
    });

    it("shows chamfer, cove and ogee as later: reachable by keyboard, with a tip, and pressing does nothing", () => {
      const store = setup("Top");
      const before = store.getState().shopRecord;
      const project = shownProject(store.getState());
      const chamfer = screen.getByRole("button", { name: /^Chamfer/ });
      expect(chamfer.getAttribute("aria-disabled")).toBe("true");
      expect(chamfer.textContent).toContain("Later");
      tabTo(chamfer);
      expect(document.activeElement).toBe(chamfer);
      const tip = screen.getByRole("tooltip").textContent;
      expect(tip).toContain("Chamfers are coming later.");
      expect(bannedWordsIn(tip ?? "")).toEqual([]);
      fireEvent.click(chamfer);
      expect(store.getState().shopRecord).toBe(before);
      expect(shownProject(store.getState())).toBe(project);
      expect(screen.queryByText(/to your shop\?/)).toBeNull();
      expect(screen.getByRole("button", { name: /^Cove/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Ogee/ })).toBeTruthy();
    });

    it("uses only shop words on the panel", () => {
      setup("Top");
      expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
    });

    it("no longer sends the woodworker to Start for bits", () => {
      const store = setup("Top");
      act(() =>
        store.getState().setShopRecord({ ...store.getState().shopRecord, router: { bits: [] } }),
      );
      expect(screen.queryByText(/Add them in Start/)).toBeNull();
      expect(
        screen.getByRole("button", { name: '1/8" roundover, not in your shop. Press to add it.' }),
      ).toBeTruthy();
    });
  });
});
