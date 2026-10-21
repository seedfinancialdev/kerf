// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Ask when it matters"; Ruling R24: every cut is planned with the saw's blade width,
// so the cut list asks what the woodworker cuts with when the pegboard was skipped, or saved with
// no saw on it, and the saw was never asked about.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { recordOf, toggleTool, wallFrom } from "../model/pegboard";
import { type ShopRecord, STARTER_RECORD } from "../model/shop-record";
import { KerfProvider } from "../state/useKerf";
import { workshopStore } from "../testing/workshop-store";
import { CutListTab } from "./CutListTab";

const QUESTION = 'Your cut list assumes a 1/8" blade. What do you cut with?';

/**
 * The cut list of a new bookcase, its shop as the skipped pegboard leaves it unless
 * `record` is given.
 */
async function cutList(record?: ShopRecord) {
  const store = await workshopStore();
  if (record) store.getState().setShopRecord(record);
  render(
    <KerfProvider store={store}>
      <CutListTab />
    </KerfProvider>,
  );
  return store;
}

describe("<CutListTab>", () => {
  it("asks a skipped pegboard what it cuts with, above the cut list", async () => {
    const store = await cutList();
    expect(store.getState().shopRecord).toEqual(STARTER_RECORD);
    const question = screen.getByText(QUESTION);
    const table = screen.getByRole("table");
    const inOrder = [...document.body.querySelectorAll("*")];
    expect(inOrder.indexOf(question)).toBeLessThan(inOrder.indexOf(table));
  });

  it("asks a pegboard saved with no saw on it", async () => {
    // "That's my shop" with the starter's table saw taken down.
    await cutList(recordOf(toggleTool(wallFrom(STARTER_RECORD), "tableSaw"), true));
    expect(screen.getByText(QUESTION)).toBeTruthy();
  });

  it("keeps the answer, says it, and stops asking", async () => {
    const store = await cutList();
    fireEvent.click(screen.getByRole("button", { name: "Circular saw" }));
    expect(store.getState().shopRecord.trackSaw).toEqual({ kerf: 25_400 }); // 1/8" = 203200 / 8
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe('Kerf will plan for a 1/8" blade.');
  });

  it("asks nothing of a pegboard saved with a saw on it", async () => {
    await cutList(recordOf(wallFrom(STARTER_RECORD), true));
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("asks nothing once the saw was asked about", async () => {
    await cutList({ ...STARTER_RECORD, told: ["saw"] });
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});
