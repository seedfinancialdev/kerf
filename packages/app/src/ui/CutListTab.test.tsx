// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Ask when it matters": the cut list depends on the saw's blade, so a shop with no saw on
// its wall, never told about one, is asked what it cuts with, above the cut list.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ShopRecord, STARTER_RECORD } from "../model/shop-record";
import { KerfProvider } from "../state/useKerf";
import { workshopStore } from "../testing/workshop-store";
import { CutListTab } from "./CutListTab";

const QUESTION = "What do you cut with?";

async function cutList(record: ShopRecord) {
  const store = await workshopStore();
  store.getState().setShopRecord(record);
  render(
    <KerfProvider store={store}>
      <CutListTab />
    </KerfProvider>,
  );
  return store;
}

const NO_SAW: ShopRecord = { ...STARTER_RECORD, tableSaw: null, trackSaw: null };

describe("<CutListTab>", () => {
  it("asks what the woodworker cuts with, above the cut list, when the shop has no saw", async () => {
    await cutList(NO_SAW);
    const question = screen.getByText(QUESTION);
    const table = screen.getByRole("table");
    const inOrder = [...document.body.querySelectorAll("*")];
    expect(inOrder.indexOf(question)).toBeLessThan(inOrder.indexOf(table));
  });

  it("keeps the answer and stops asking", async () => {
    const store = await cutList(NO_SAW);
    fireEvent.click(screen.getByRole("button", { name: "Table saw" }));
    expect(store.getState().shopRecord.tableSaw).toEqual({ kerf: 25_400 }); // 1/8" = 203200 / 8
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("asks nothing when a saw is on the wall", async () => {
    await cutList(STARTER_RECORD);
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("asks nothing when the woodworker already said there is no saw", async () => {
    await cutList({ ...NO_SAW, told: ["saw"] });
    expect(screen.queryByText(QUESTION)).toBeNull();
  });
});
