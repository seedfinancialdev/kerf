// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Ask when it matters"; ADR 016, D4: a step that needs a tool the shop record was never
// told about asks once, in place, and the answer is written to the shop record.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STARTER_RECORD, type ToolTopic } from "../model/shop-record";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { KerfProvider } from "../state/useKerf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { AskAboutTool } from "./AskAboutTool";

/** A store on fresh storage, whose shop is the starter record (a skipped pegboard: not set up). */
function newStore(saved = memoryStorage()): KerfStore {
  return createKerfStore({ storage: createStorage(saved), library: memoryLibrary() });
}

function ask(store: KerfStore, topic: ToolTopic) {
  render(
    <KerfProvider store={store}>
      <AskAboutTool topic={topic} />
    </KerfProvider>,
  );
}

const DADO_QUESTION = "This joint needs a dado stack. Do you have one?";

describe("<AskAboutTool>", () => {
  it("asks about a dado stack the shop was never told about", () => {
    const store = newStore();
    expect(store.getState().shopRecord).toEqual(STARTER_RECORD);
    ask(store, "dadoStack");
    expect(screen.getByText(DADO_QUESTION)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, I have one" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, show me another way" })).toBeTruthy();
  });

  it('keeps the 3/4" dado stack on Yes, and never asks again, even after a reload', () => {
    const saved = memoryStorage();
    const store = newStore(saved);
    ask(store, "dadoStack");
    fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
    // The starter's dado stack: 3/4" = 3 × 203200 / 4 = 152,400.
    expect(store.getState().shopRecord.dadoStack).toEqual({ maxWidth: 152_400 });
    expect(store.getState().shopRecord.told).toEqual(["dadoStack"]);
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
    cleanup();
    ask(newStore(saved), "dadoStack");
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
  });

  it("takes the dado stack out of the shop on No, and marks it told", () => {
    const store = newStore();
    ask(store, "dadoStack");
    fireEvent.click(screen.getByRole("button", { name: "No, show me another way" }));
    expect(store.getState().shopRecord.dadoStack).toBeNull();
    expect(store.getState().shopRecord.told).toEqual(["dadoStack"]);
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
  });

  it("asks nothing of a shop set up on the pegboard", () => {
    const store = newStore();
    store.getState().setShopRecord({ ...STARTER_RECORD, setUp: true });
    ask(store, "dadoStack");
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks what the woodworker cuts with, offering four answers", () => {
    ask(newStore(), "saw");
    expect(screen.getByText("What do you cut with?")).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Table saw",
      "Track saw",
      "Circular saw",
      'Not sure, use 1/8"',
    ]);
  });

  // A circular saw is a handheld saw run along a guide, so it is kept as a track saw; "not sure" is
  // the common 1/8" blade on the same card (Task 11 brief).
  const SAW_ANSWERS = [
    ["Table saw", "tableSaw"],
    ["Track saw", "trackSaw"],
    ["Circular saw", "trackSaw"],
    ['Not sure, use 1/8"', "trackSaw"],
  ] as const;

  it.each(SAW_ANSWERS)('"%s" hangs a %s with a 1/8" blade and marks the saw told', (label, saw) => {
    const store = newStore();
    store.getState().setShopRecord({ ...STARTER_RECORD, tableSaw: null, trackSaw: null });
    ask(store, "saw");
    fireEvent.click(screen.getByRole("button", { name: label }));
    const record = store.getState().shopRecord;
    expect(record[saw]).toEqual({ kerf: 25_400 }); // 1/8" = 203200 / 8
    expect(record.told).toEqual(["saw"]);
    expect(screen.queryByText("What do you cut with?")).toBeNull();
  });
});
