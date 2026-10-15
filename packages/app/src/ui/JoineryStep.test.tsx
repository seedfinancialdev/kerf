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

  // Design spec, "Ask when it matters"; ADR 016, D4. A fresh store's shop is the starter record, as
  // a skipped pegboard leaves it: not told about any tool.
  describe("with a shop never told about its tools", () => {
    const DADO_QUESTION = "This joint needs a dado stack. Do you have one?";
    const shopSentences = () =>
      [...document.querySelectorAll(".joint-shop")].map((e) => e.textContent);

    it("asks about the dado stack once, in place of what the shop can cut", () => {
      setup();
      // Two rows of dados (one per side), one question.
      expect(screen.getAllByText(DADO_QUESTION)).toHaveLength(1);
      expect(screen.getByText(DADO_QUESTION).closest("li")?.textContent).toContain(
        "Shelf in dados in",
      );
      expect(screen.queryByText("Your dado stack cuts this.")).toBeNull();
    });

    it("says the dado stack cuts them once the woodworker has one", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
      expect(screen.queryByText(DADO_QUESTION)).toBeNull();
      expect(screen.getAllByText("Your dado stack cuts this.").length).toBeGreaterThan(0);
    });

    it("gives the engine's missing-tool sentence once the woodworker has no dado stack", () => {
      const store = setup();
      fireEvent.click(screen.getByRole("button", { name: "No, show me another way" }));
      expect(store.getState().shopRecord.dadoStack).toBeNull();
      // Operation specs, bookcase: the shelves' dados are 23/32" wide; the starter router has only a
      // roundover bit, so nothing in the shop cuts them (model/joinery.ts shopSentence).
      expect(
        screen
          .getAllByText(/^Shelf in dados in /)
          .map((e) => e.closest("li")?.querySelector(".joint-shop")?.textContent),
      ).toEqual([
        "You'd need a dado stack, or a router with a straight bit no wider than 23/32\".",
        "You'd need a dado stack, or a router with a straight bit no wider than 23/32\".",
      ]);
    });

    it("asks about hand tools for the box's dovetailed corners", () => {
      setup("Keepsake box");
      expect(
        screen.getAllByText(
          "These corners are cut by hand. Do you have chisels and a dovetail saw?",
        ),
      ).toHaveLength(1);
    });

    it("asks nothing of a shop set up on the pegboard", () => {
      setup("Bookcase", true);
      expect(screen.queryByText(DADO_QUESTION)).toBeNull();
      expect(shopSentences().every((t) => t === "Your dado stack cuts this.")).toBe(true);
    });
  });
});
