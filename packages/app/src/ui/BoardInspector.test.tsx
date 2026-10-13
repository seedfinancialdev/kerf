// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Inspector": "a part's properties ('Length 34-9/16" · cut 35-1/16"')";
// Domain model, decision 3: "The UI always shows both when they differ".

import type { Id } from "@kerf/core";
import { generateStructures } from "@kerf/core";
import { initGeometry } from "@kerf/geometry";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { addRoundover, detachForEdit, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Inspector } from "./Inspector";

type Store = ReturnType<typeof createKerfStore>;

const placements = (store: Store) => store.getState().solved?.result.placements ?? [];
const shelves = (store: Store): Id[] =>
  placements(store)
    .filter((p) => p.source?.role === "shelf")
    .map((p) => p.instance);
const topOf = (store: Store): Id[] =>
  placements(store)
    .filter((p) => p.name === "Top")
    .map((p) => p.instance);

function setup(pick: (store: Store) => Id[]) {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  act(() => {
    store.getState().setStep("Shape");
    store.getState().select({ kind: "boards", instances: pick(store) });
  });
  render(
    <KerfProvider store={store}>
      <Inspector />
    </KerfProvider>,
  );
  return store;
}

describe("<BoardInspector>", () => {
  it("shows a shelf's visible and cut length", () => {
    setup(shelves);
    expect(screen.getByText('34-9/16" · cut 35-1/16"')).toBeTruthy();
  });

  it("says four shelves are selected and that the form makes them", () => {
    setup(shelves);
    expect(screen.getByRole("heading", { name: "Shelf × 4" })).toBeTruthy();
    expect(screen.getByText("Made by the form. Editing one by hand takes it over.")).toBeTruthy();
  });

  it("names a mixed pick by its boards and gives no single size", () => {
    setup((s) => [...shelves(s), ...topOf(s)]);
    expect(screen.getByRole("heading", { name: "5 boards" })).toBeTruthy();
    expect(screen.getByText("Top, Shelf × 4")).toBeTruthy();
    expect(screen.queryByText("Length")).toBeNull();
  });

  it("says so when the picked boards are not all made the same way", () => {
    const store = setup(topOf);
    const p = shownProject(store.getState());
    const top = placements(store).find((x) => x.name === "Top");
    if (!p || !top) throw new Error("no top");
    act(() => {
      store.getState().apply(addRoundover(p, top, ["edge1/face1"], 25_400, store.getState().shop));
      store.getState().select({ kind: "boards", instances: [...topOf(store), ...shelves(store)] });
    });
    expect(screen.getByText("Some made by the form, some by hand.")).toBeTruthy();
  });

  it("offers to hand a taken-over board back to the form", () => {
    const store = setup(topOf);
    expect(screen.queryByRole("button", { name: "Follow the form again" })).toBeNull();
    const p = shownProject(store.getState());
    const top = placements(store).find((x) => x.name === "Top");
    if (!p || !top) throw new Error("no top");
    act(() => {
      store.getState().apply(addRoundover(p, top, ["edge1/face1"], 25_400, store.getState().shop));
      store.getState().select({ kind: "boards", instances: topOf(store) });
    });
    fireEvent.click(screen.getByRole("button", { name: "Follow the form again" }));
    expect(store.getState().history?.entries.at(-1)?.label).toBe("Top follows the form again");
    expect(placements(store).find((x) => x.name === "Top")?.detached).toBe(false);
  });

  it("tells the user what to remove first when a board cannot go back to the form", () => {
    const store = setup(topOf);
    const p = shownProject(store.getState());
    const { shop } = store.getState();
    const member = placements(store).find((x) => x.source?.role === "shelf");
    const top = placements(store).find((x) => x.name === "Top");
    const sample = p && generateStructures(p, shop).joints[0];
    if (!p || !member || !top || !sample) throw new Error("no boards or joint");
    const both = addRoundover(
      detachForEdit(p, member, shop).project,
      top,
      ["edge1/face1"],
      25_400,
      shop,
    );
    const own = both.project.instances.find((i) => i.detachedFrom);
    const topInstance = both.project.instances.find((i) => i.name === "Top");
    if (!own || !topInstance) throw new Error("no detached boards");
    const { generatedBy: _, ...byHand } = {
      ...sample,
      id: "01K7M3Q8ZD00000000H0000001",
      host: topInstance.id,
      guest: own.id,
    };
    act(() => {
      store.getState().apply({
        project: { ...both.project, joints: [...both.project.joints, byHand] },
        label: "Test",
      });
      store.getState().select({ kind: "boards", instances: [own.id] });
    });
    fireEvent.click(screen.getByRole("button", { name: "Follow the form again" }));
    expect(store.getState().notice?.text).toMatch(/remove that first/);
  });

  it('lists a problem on the picked board: a 3" roundover on a 23/32" top', () => {
    const store = setup(topOf);
    const p = shownProject(store.getState());
    const top = placements(store).find((x) => x.name === "Top");
    if (!p || !top) throw new Error("no top");
    act(() => {
      store
        .getState()
        .apply(addRoundover(p, top, ["edge1/face1"], 3 * 203_200, store.getState().shop));
      store.getState().select({ kind: "boards", instances: topOf(store) });
    });
    expect(document.querySelector(".problem.error")?.textContent).toMatch(/roundover/i);
  });

  it("shows no problems for a board that has none", () => {
    setup(topOf);
    expect(document.querySelector(".problems")).toBeNull();
  });

  it("shows the Shape step's size fields after boards were picked on another step and Shape is chosen again", () => {
    const store = setup(shelves);
    act(() => {
      store.getState().setStep("Joinery");
      store.getState().select({ kind: "boards", instances: shelves(store) });
      store.getState().setStep("Shape");
    });
    expect(screen.getByLabelText("Width")).toBeTruthy();
  });

  // ADR 015, rule 10: a board drawn as a plain blank says why.
  describe("when the 3D view cannot draw a board's cuts", () => {
    beforeAll(initGeometry);

    function withCuts(removals: unknown[]) {
      const store = setup(topOf);
      const solved = store.getState().solved;
      const top = placements(store).find((x) => x.name === "Top");
      if (!solved || !top) throw new Error("no top");
      act(() => {
        store.setState({
          solved: {
            ...solved,
            result: {
              ...solved.result,
              shapes: solved.result.shapes.map((s) =>
                s.definition === top.shape ? { ...s, removals } : s,
              ),
            },
          },
        } as never);
      });
    }

    it("shows the reason as a warning on the board", async () => {
      withCuts([{ kind: "nonsense" }]);
      expect(
        await screen.findByText(/^The 3D view shows this board without its cuts: /),
      ).toBeTruthy();
    });

    it("shows no warning for a board whose cuts can be drawn, once the engine is ready", async () => {
      withCuts([]);
      // The warning is only decided once the engine is ready; let that settle before asserting.
      await act(async () => {
        await initGeometry();
      });
      expect(screen.queryByText(/without its cuts/)).toBeNull();
    });
  });
});
