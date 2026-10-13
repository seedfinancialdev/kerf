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
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";

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

  it("splits an empty case into 3 bays from Number of bays", () => {
    const store = setup("Blank case");
    fireEvent.click(screen.getByRole("button", { name: "Split into bays" }));
    const bays = screen.getByLabelText("Number of bays");
    fireEvent.change(bays, { target: { value: "3" } });
    fireEvent.blur(bays);
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Split into 3 bays");
    // 3 bays, 2 partitions between them.
    const partitions = store
      .getState()
      .solved?.result.placements.filter((x) => x.name.startsWith("Partition"));
    expect(partitions).toHaveLength(2);
  });

  it("says why under the field and records nothing for 1 bay", () => {
    const store = setup("Blank case");
    fireEvent.click(screen.getByRole("button", { name: "Split into bays" }));
    const bays = screen.getByLabelText("Number of bays");
    fireEvent.change(bays, { target: { value: "1" } });
    fireEvent.blur(bays);
    expect(screen.getByText("Bays need a number of 2 or more.")).toBeTruthy();
    expect(store.getState().history?.entries).toHaveLength(1);
  });

  it("puts a partition 12 inches from the left from the From the left field", () => {
    const store = setup("Blank case");
    fireEvent.click(screen.getByRole("button", { name: "Add partition" }));
    const at = screen.getByLabelText("From the left");
    fireEvent.change(at, { target: { value: '12"' } });
    fireEvent.blur(at);
    expect(store.getState().history?.entries.at(-1)?.label).toBe('Added a partition at 12"');
    // ADR 014, D9: measured from the opening's left face (the left side's inside face, at
    // 23/32" = 146050) to the partition's left face: 146050 + 12 x 203200 = 2584450.
    const partition = store
      .getState()
      .solved?.result.placements.find((x) => x.name.startsWith("Partition"));
    expect(partition?.box.min[0]).toBe(2_584_450);
  });

  it("empties the bookcase's opening: the shelves go, as one named change", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Empty the opening" }));
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Emptied the opening");
    expect(line(store)).toBeUndefined();
  });

  it("places shelves at the heights typed, and the count follows the heights", () => {
    const store = setup("Blank case");
    fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
    fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "heights" } });
    const heights = screen.getByLabelText("Heights from the bottom");
    fireEvent.change(heights, { target: { value: '12", 24"' } });
    fireEvent.blur(heights);
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Added 2 shelves");
    // ADR 014, D9: each height is a shelf's underside from the case's bottom: 12" = 2438400,
    // 24" = 4876800.
    const undersides = store
      .getState()
      .solved?.result.placements.filter((x) => x.source?.role === "shelf")
      .map((x) => x.box.min[2])
      .sort((a, b) => a - b);
    expect(undersides).toEqual([2_438_400, 4_876_800]);
  });

  describe("Spacing (branch deferred row 18, silent-failure review M1)", () => {
    const entries = (s: ReturnType<typeof setup>) => s.getState().history?.entries.length;

    it("shows the heights box for At set heights and records nothing until heights are typed", () => {
      const store = setup();
      fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
      const before = entries(store);
      fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "heights" } });
      expect(screen.getByLabelText("Heights from the bottom")).toBeTruthy();
      expect(entries(store)).toBe(before);
      expect(line(store)?.quantity).toBe(6);
    });

    it("refuses Evenly spaced when the count cannot be worked out, instead of writing 1 shelf", () => {
      const store = setup();
      const p = shownProject(store.getState());
      const structure = p?.structures[0];
      const opening = structure?.openings[0];
      if (!p || !structure || !opening) throw new Error("no opening");
      // Shelves at two set heights, counted by a name the project does not have.
      const unknownCount = {
        ...p,
        structures: [
          {
            ...structure,
            openings: [
              {
                ...opening,
                division: {
                  type: "shelves" as const,
                  count: "no_such_count",
                  spacing: ["10in", "20in"],
                },
              },
            ],
          },
        ],
      };
      act(() => store.getState().apply({ label: "Heights", project: unknownCount }));
      fireEvent.click(screen.getByRole("button", { name: "Add shelves" }));
      const before = entries(store);
      fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "even" } });
      expect(entries(store)).toBe(before);
      expect(store.getState().notice?.text).toBe(
        "The shelf count can't be worked out; type a count first.",
      );
    });
  });
});
