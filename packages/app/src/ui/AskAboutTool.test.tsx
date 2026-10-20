// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Ask when it matters"; ADR 016, D4: a step that needs a tool the shop record was
// never told about asks once, in place, and the answer is written to the shop record. Rulings R24
// and R25: nothing is assumed silently, and each answer says what Kerf will plan for.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { STARTER_RECORD, type ToolTopic } from "../model/shop-record";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { KerfProvider } from "../state/useKerf";
import { bannedWordsIn } from "../testing/banned-words";
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

const DADO_QUESTION = "Dados, grooves and rabbets need a dado stack. Do you have one?";
const status = () => screen.getByRole("status").textContent;

describe("<AskAboutTool>", () => {
  it("asks about a dado stack the shop was never told about, with its widest cut", () => {
    const store = newStore();
    expect(store.getState().shopRecord).toEqual(STARTER_RECORD);
    ask(store, "dadoStack");
    expect(screen.getByText(DADO_QUESTION)).toBeTruthy();
    // The starter's dado stack, 3/4", is chosen to start with (R25).
    const widest = screen.getByLabelText("Widest cut") as HTMLSelectElement;
    expect(widest.selectedOptions[0]?.textContent).toBe('3/4"');
    expect(screen.getByRole("button", { name: "Yes, I have one" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, show me another way" })).toBeTruthy();
    expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
  });

  it("saves the widest cut chosen on Yes, says so, and never asks again, even after a reload", () => {
    const saved = memoryStorage();
    const store = newStore(saved);
    ask(store, "dadoStack");
    fireEvent.change(screen.getByLabelText("Widest cut"), { target: { value: "101600" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
    // 1/2" = 203200 / 2 = 101,600.
    expect(store.getState().shopRecord.dadoStack).toEqual({ maxWidth: 101_600 });
    expect(store.getState().shopRecord.told).toEqual(["dadoStack"]);
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
    expect(status()).toBe(
      'Kerf will plan dados, grooves and rabbets up to 1/2" wide with your dado stack.',
    );
    cleanup();
    ask(newStore(saved), "dadoStack");
    expect(screen.queryByText(DADO_QUESTION)).toBeNull();
  });

  it("starts the widest cut at the record's own dado stack", () => {
    const store = newStore();
    store.getState().setShopRecord({ ...STARTER_RECORD, dadoStack: { maxWidth: 165_100 } });
    ask(store, "dadoStack");
    // 13/16" = 13 × 203200 / 16 = 165,100.
    const widest = screen.getByLabelText("Widest cut") as HTMLSelectElement;
    expect(widest.selectedOptions[0]?.textContent).toBe('13/16"');
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

  it("keeps the router on Yes and says to add its bits in Your shop (R25)", () => {
    const store = newStore();
    ask(store, "router");
    expect(screen.getByText("These joints need a router. Do you have one?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I have one" }));
    expect(store.getState().shopRecord.router).toEqual(STARTER_RECORD.router);
    expect(status()).toBe("Kerf has your router. Add your bits in Your shop.");
  });

  it("hangs chisels and a dovetail saw on Yes and says Kerf plans hand-cut dovetails (R25)", () => {
    const store = newStore();
    store.getState().setShopRecord({ ...STARTER_RECORD, chisels: false, dovetailSaw: false });
    ask(store, "handTools");
    fireEvent.click(screen.getByRole("button", { name: "Yes, I have them" }));
    const record = store.getState().shopRecord;
    expect([record.chisels, record.dovetailSaw]).toEqual([true, true]);
    expect(status()).toBe("Kerf will plan hand-cut dovetails.");
  });

  it("asks a skipped pegboard what it cuts with, four answers as equals (R24)", () => {
    ask(newStore(), "saw");
    expect(
      screen.getByText('Your cut list assumes a 1/8" blade. What do you cut with?'),
    ).toBeTruthy();
    const answers = screen.getAllByRole("button");
    expect(answers.map((b) => b.textContent)).toEqual([
      "Table saw",
      "Track saw",
      "Circular saw",
      'Not sure, use 1/8"',
    ]);
    expect(answers.filter((b) => b.classList.contains("primary"))).toEqual([]);
    expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
  });

  // A circular saw is a handheld saw run along a guide, so it is kept as a track saw. The words say
  // only what the woodworker chose (R24).
  const SAW_ANSWERS = [
    ["Table saw", "tableSaw", `Kerf will plan for your table saw's 1/8" blade.`],
    ["Track saw", "trackSaw", `Kerf will plan for your track saw's 1/8" blade.`],
    ["Circular saw", "trackSaw", 'Kerf will plan for a 1/8" blade.'],
  ] as const;

  it('records "not sure" as told without hanging a saw the woodworker never claimed', () => {
    const store = newStore();
    ask(store, "saw");
    fireEvent.click(screen.getByRole("button", { name: 'Not sure, use 1/8"' }));
    const record = store.getState().shopRecord;
    expect([record.tableSaw, record.trackSaw]).toEqual([STARTER_RECORD.tableSaw, null]);
    expect(record.told).toEqual(["saw"]);
    expect(status()).toBe('Kerf will plan for a 1/8" blade.');
  });

  it('offers "not sure" in the project\'s units', () => {
    const store = newStore();
    store.getState().apply(startProject("Bookcase", "metric"));
    ask(store, "saw");
    // 1/8" = 3.175 mm, shown to 0.1 mm: 3.2 mm.
    expect(screen.getByRole("button", { name: "Not sure, use 3.2 mm" })).toBeTruthy();
  });

  it.each(SAW_ANSWERS)('"%s" keeps a %s with a 1/8" blade and says "%s"', (label, saw, says) => {
    const store = newStore();
    ask(store, "saw");
    fireEvent.click(screen.getByRole("button", { name: label }));
    const record = store.getState().shopRecord;
    expect(record[saw]).toEqual({ kerf: 25_400 }); // 1/8" = 203200 / 8
    expect(record.told).toEqual(["saw"]);
    expect(screen.queryByText(/What do you cut with\?/)).toBeNull();
    expect(status()).toBe(says);
  });

  it("names the blade of the saw just chosen, though the shop also has another saw", () => {
    const store = newStore();
    // A skipped pegboard that assumes a table saw with a thin-kerf blade: 3/32" = 19,050.
    store.getState().setShopRecord({ ...STARTER_RECORD, tableSaw: { kerf: 19_050 } });
    ask(store, "saw");
    fireEvent.click(screen.getByRole("button", { name: "Track saw" }));
    // The new track saw starts on a standard 1/8" blade.
    expect(status()).toBe(`Kerf will plan for your track saw's 1/8" blade.`);
  });

  it("keeps the saw answered and never asks again, even after a reload", () => {
    const saved = memoryStorage();
    ask(newStore(saved), "saw");
    fireEvent.click(screen.getByRole("button", { name: "Track saw" }));
    cleanup();
    const reloaded = newStore(saved);
    expect(reloaded.getState().shopRecord.trackSaw).toEqual({ kerf: 25_400 }); // 1/8" = 203200 / 8
    expect(reloaded.getState().shopRecord.told).toEqual(["saw"]);
    ask(reloaded, "saw");
    expect(screen.queryByText(/What do you cut with\?/)).toBeNull();
  });
});
