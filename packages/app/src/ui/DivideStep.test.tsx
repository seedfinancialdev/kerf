// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "3. Divide": add shelves (count, evenly spaced or at set heights), partition,
// bays. Operation specs, resize checks: "With shelf count set to 5, the merged line becomes 7."

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";
import { KerfProvider } from "./useKerf";

function setup(template: "Bookcase" | "Blank case" = "Bookcase") {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject(template, "imperial"));
  const p = shownProject(store.getState());
  const s = p?.structures[0];
  store.getState().setStep("Divide");
  store
    .getState()
    .select({ kind: "opening", structure: s?.id ?? "", opening: s?.openings[0]?.id ?? "" });
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

const line = (s: ReturnType<typeof setup>) =>
  s.getState().solved?.result.cutList.lines.find((l) => l.parts.some((p) => p.name === "Shelf"));

describe("the Divide step", () => {
  it("asks for an opening when none is picked", () => {
    const store = setup();
    act(() => store.getState().select({ kind: "none" }));
    expect(screen.getByText("Click an opening in the project tree.")).toBeTruthy();
  });

  it("shows the shelves already in the opening: Count 4, evenly spaced", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
    expect((screen.getByLabelText("Count") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Spacing") as HTMLSelectElement).value).toBe("even");
  });

  it("makes the shelves line 7 with a count of 5", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
    const count = screen.getByLabelText("Count");
    fireEvent.change(count, { target: { value: "5" } });
    fireEvent.blur(count);
    expect(line(store)?.quantity).toBe(7);
  });

  it("records nothing when the count is left as it was", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
    fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "even" } });
    expect(store.getState().history?.entries).toHaveLength(1);
  });

  it("adds 3 shelves to an empty case", () => {
    const store = setup("Blank case");
    fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
    const count = screen.getByLabelText("Count");
    fireEvent.change(count, { target: { value: "3" } });
    fireEvent.blur(count);
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Added 3 shelves");
  });
});
