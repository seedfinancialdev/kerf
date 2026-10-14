// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "4. Joinery from your shop": the first-launch checklist (table saw kerf, dado
// stack max width, router bits, roundover bits, hand tools for dovetails). ADR 015, D4.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STARTER_SHOP } from "../model/starter";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { ShopCard } from "./ShopCard";

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  render(
    <KerfProvider store={store}>
      <ShopCard />
    </KerfProvider>,
  );
  return store;
}

describe("<ShopCard>", () => {
  it("starts with the starter shop ticked: dado stack, router, dovetails", () => {
    setup();
    expect((screen.getByLabelText("Dado stack") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Router") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Dovetails by hand") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Blade kerf") as HTMLInputElement).value).toBe('1/8"');
    expect((screen.getByLabelText("Roundover bits") as HTMLInputElement).value).toBe('1/8"');
  });

  it("removes the dado stack when unticked", () => {
    const store = setup();
    fireEvent.click(screen.getByLabelText("Dado stack"));
    expect(store.getState().shop.tools.some((t) => t.type === "dadoStack")).toBe(false);
  });

  it("reads a list of roundover bits", () => {
    const store = setup();
    const bits = screen.getByLabelText("Roundover bits");
    fireEvent.change(bits, { target: { value: '1/8", 1/4"' } });
    fireEvent.blur(bits);
    const router = store.getState().shop.tools.find((t) => t.type === "router");
    expect(router).toEqual({ type: "router", straightBits: [], roundoverBits: [25_400, 50_800] });
  });

  it("refuses a bit list it cannot read and keeps the shop as it was", () => {
    const store = setup();
    const bits = screen.getByLabelText("Roundover bits");
    fireEvent.change(bits, { target: { value: "big" } });
    fireEvent.blur(bits);
    expect(store.getState().shop).toEqual(STARTER_SHOP);
    expect(screen.getByText(/^"big"/)).toBeTruthy();
  });

  it("refuses a negative blade kerf with the engine's reason and keeps the shop as it was", () => {
    const store = setup();
    const kerf = screen.getByLabelText("Blade kerf");
    fireEvent.change(kerf, { target: { value: '-1/8"' } });
    fireEvent.blur(kerf);
    expect(store.getState().shop).toEqual(STARTER_SHOP);
    expect(screen.getByText(/kerf/i, { selector: ".field-problem" })).toBeTruthy();
  });

  it("says why a tick is refused instead of flipping it back in silence", () => {
    const store = setup();
    // A shop whose router holds a bit of no size: any change to it is refused by the engine.
    const broken = {
      ...STARTER_SHOP,
      tools: STARTER_SHOP.tools.map((t) =>
        t.type === "router" ? { ...t, roundoverBits: [-25_400] } : t,
      ),
    };
    act(() => store.getState().setShop(broken));
    fireEvent.click(screen.getByLabelText("Dado stack"));
    expect(store.getState().shop).toEqual(broken);
    expect(store.getState().notice?.kind).toBe("said");
    expect(store.getState().notice?.text).toMatch(/\S/);
  });
});
