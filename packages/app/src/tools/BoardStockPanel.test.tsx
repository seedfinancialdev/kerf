// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Board: Draw a board from stock": the Board tool offers the project's stock,
// the first sheet to begin with.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { STOCK_IDS } from "../model/starter";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "../ui/Inspector";
import { KerfProvider } from "../ui/useKerf";

function setup(tool: "board" | "select" = "board") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  store.getState().setStep("Shape");
  store.getState().setTool(tool);
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

afterEach(cleanup);

describe("<BoardStockPanel>", () => {
  it("offers the project's stock, starting on the first sheet", () => {
    setup();
    const stock = screen.getByLabelText("Stock") as HTMLSelectElement;
    expect(stock.value).toBe(STOCK_IDS.plywood34);
    expect([...stock.options].map((o) => o.textContent)).toContain("1/4 plywood");
  });

  it("chooses the stock new boards are drawn in", () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText("Stock"), { target: { value: STOCK_IDS.plywood14 } });
    expect(store.getState().boardStock).toBe(STOCK_IDS.plywood14);
  });

  it("is not shown for another tool", () => {
    setup("select");
    expect(screen.queryByLabelText("Stock")).toBeNull();
  });
});
