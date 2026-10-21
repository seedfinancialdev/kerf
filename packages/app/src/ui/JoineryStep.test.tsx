// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, D2: Accept all marks the joinery reviewed; it can be undone.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject, type TemplateName } from "../model/commands";
import { STARTER_RECORD } from "../model/shop-record";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";

function setup(template: TemplateName = "Bookcase", setUp = false) {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  if (setUp) store.getState().setShopRecord({ ...STARTER_RECORD, setUp: true });
  store.getState().apply(startProject(template, "imperial"));
  act(() => store.getState().setStep("Joinery"));
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("the Joinery step", () => {
  it('lists the shelves\' dados once for each side, 23/32" wide and 1/4" deep', () => {
    // Operation specs, bookcase: the shelves sit in 23/32" x 1/4" dados in each side. The form
    // joins its row of shelves to each side with one joint (structures/openings.ts), so there is
    // one line per side.
    setup();
    const rows = screen
      .getAllByText(/^Shelf in dados in /)
      .map((e) => [e.textContent, e.closest("li")?.querySelector(".joint-detail")?.textContent]);
    expect(rows.sort()).toEqual([
      ["Shelf in dados in Left side", '23/32" wide, 1/4" deep'],
      ["Shelf in dados in Right side", '23/32" wide, 1/4" deep'],
    ]);
  });

  it("accepts all, then says so", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(shownProject(store.getState())?.structures[0]?.options.joineryReviewed).toBe(true);
    expect(screen.getByText("Joinery accepted. You can still change any joint.")).toBeTruthy();
  });

  it("undoes Accept all", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    act(() => store.getState().undo());
    expect(shownProject(store.getState())?.structures[0]?.options.joineryReviewed).toBeUndefined();
  });

  it("offers the box's corner choice and applies it", () => {
    const store = setup("Keepsake box");
    fireEvent.change(screen.getByLabelText("Corners"), { target: { value: "rabbet" } });
    expect(shownProject(store.getState())?.structures[0]?.options.cornerJoint).toBe("rabbet");
  });

  // Design spec, "Ask when it matters"; ADR 016, D4; Ruling R25. A fresh store's shop is the
  // starter record, as a skipped pegboard leaves it: not told about any tool.
  describe("with a shop never told about its tools", () => {
    const DADO_QUESTION = "Dados, grooves and rabbets need a dado stack. Do you have one?";
    const ASKING = "Asking about your tools above.";
    // Operation specs, bookcase: the shelves' dados are 23/32" wide; the starter router has only a
    // roundover bit, so nothing else cuts them (model/joinery.ts shopSentence).
    const NOTHING_CUTS =
      "You'd need a dado stack, or a router with a straight bit no wider than 23/32\".";
    const shelfSentences = () =>
      screen
        .getAllByText(/^Shelf in dados in /)
        .map((e) => e.closest("li")?.querySelector(".joint-shop")?.textContent);

    it("asks about the dado stack once, and says so on every other row it holds up", () => {
      setup();
      // In each side: the shelves' dados and the top's, bottom's and back's rabbets, so 8 rows; one
      // question, and the 7 other rows say they wait on it.
      expect(screen.getAllByText(DADO_QUESTION)).toHaveLength(1);
      expect(screen.getByText(DADO_QUESTION).closest("li")?.textContent).toContain(
        "Shelf in dados in",
      );
      expect(screen.queryByText("Your dado stack cuts this.")).toBeNull();
      expect(screen.getAllByText(ASKING)).toHaveLength(7);
      expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
    });

    it('says the dado stack cuts them once the woodworker has a 3/4" one', () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
      expect(screen.queryByText(DADO_QUESTION)).toBeNull();
      expect(screen.queryByText(ASKING)).toBeNull();
      expect(shelfSentences()).toEqual([
        "Your dado stack cuts this.",
        "Your dado stack cuts this.",
      ]);
    });

    it("says the dado stack chosen is too narrow for the dados, and what would cut them", () => {
      const store = setup();
      // 1/2" (101,600) is narrower than the shelves' 23/32" dados (Task 11 review: say so, rather
      // than "You'd need a dado stack" to a shop that has one).
      fireEvent.change(screen.getByLabelText("Widest cut"), { target: { value: "101600" } });
      fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
      expect(store.getState().shopRecord.dadoStack).toEqual({ maxWidth: 101_600 });
      const tooNarrow =
        'Your dado stack cuts up to 1/2" wide. This joint is 23/32" wide; it needs a router with a straight bit no wider than 23/32".';
      expect(shelfSentences()).toEqual([tooNarrow, tooNarrow]);
    });

    it("gives the engine's missing-tool sentence once the woodworker has no dado stack", () => {
      const store = setup();
      fireEvent.click(screen.getByRole("button", { name: "No, show me another way" }));
      expect(store.getState().shopRecord.dadoStack).toBeNull();
      expect(shelfSentences()).toEqual([NOTHING_CUTS, NOTHING_CUTS]);
    });

    it("asks about a router when a straight bit would cut the dados", () => {
      const store = createKerfStore({
        storage: createStorage(memoryStorage()),
        library: memoryLibrary(),
      });
      store.getState().setShopRecord({
        ...STARTER_RECORD,
        dadoStack: null,
        router: { bits: [{ shape: "straight", size: 203_200 / 4 }] },
      });
      store.getState().apply(startProject("Bookcase", "imperial"));
      act(() => store.getState().setStep("Joinery"));
      render(
        <KerfProvider store={store}>
          <Inspector />
        </KerfProvider>,
      );
      expect(screen.getAllByText("These joints need a router. Do you have one?")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
      expect(screen.getByRole("status").textContent).toBe(
        "Kerf has your router. Add your bits in Your shop.",
      );
      expect(shelfSentences()).toEqual([
        "Your router cuts this, in more than one pass if the bit is narrower.",
        "Your router cuts this, in more than one pass if the bit is narrower.",
      ]);
    });

    it("asks about hand tools for the box's dovetailed corners, and says what Kerf plans", () => {
      setup("Keepsake box");
      expect(
        screen.getAllByText(
          "These corners are cut by hand. Do you have chisels and a dovetail saw?",
        ),
      ).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Yes, I have them" }));
      expect(screen.getByRole("status").textContent).toBe("Kerf will plan hand-cut dovetails.");
    });

    it("asks nothing of a shop set up on the pegboard", () => {
      setup("Bookcase", true);
      expect(screen.queryByText(DADO_QUESTION)).toBeNull();
      expect(screen.queryByText(ASKING)).toBeNull();
      expect(shelfSentences()).toEqual([
        "Your dado stack cuts this.",
        "Your dado stack cuts this.",
      ]);
    });
  });
});
