// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Join": the proposal is shown with Accept; a refusal shows its reason.

import { type PlacedPart, type Project, solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { bookcaseWithShelf } from "../testing/bookcase-with-shelf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { drawBoard } from "../tools/board";
import { propose } from "../tools/join";
import { JoinPanel } from "./JoinPanel";

afterEach(cleanup);

function setup() {
  const project = bookcaseWithShelf();
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  store.getState().begin({ label: "Start", project });
  store.getState().setTool("join");
  render(
    <KerfProvider store={store}>
      <JoinPanel />
    </KerfProvider>,
  );
  const named = (name: string) => {
    const found = solve(project, loadShopProfile()).placements.find((x) => x.name === name);
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  return { store, project, named };
}

describe("<JoinPanel>", () => {
  it("asks for two boards before there is a proposal", () => {
    setup();
    expect(screen.getByText("Click two touching boards.")).toBeTruthy();
  });

  it("shows the reason as a note when the boards cannot be joined", () => {
    const { store, project, named } = setup();
    act(() =>
      store
        .getState()
        .setProposal(propose(project, loadShopProfile(), named("Top"), named("Board 1"))),
    );
    expect(screen.getByRole("note").textContent).toBe(
      "Top and Board 1 do not touch, so there is nothing to join.",
    );
  });

  it("Accept records the joint as one named change", () => {
    const { store, project, named } = setup();
    act(() =>
      store
        .getState()
        .setProposal(propose(project, loadShopProfile(), named("Right side"), named("Board 1"))),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    const history = store.getState().history;
    expect(history?.entries.at(-1)?.label).toBe("Joined Board 1 to Right side with a dado");
    expect(store.getState().proposal).toBeNull();
  });

  describe("with a form-made bookcase", () => {
    const formSetup = () => {
      const store = createKerfStore({
        storage: createStorage(memoryStorage()),
        library: memoryLibrary(),
      });
      store.getState().begin(startProject("Bookcase", "imperial"));
      store.getState().setTool("join");
      render(
        <KerfProvider store={store}>
          <JoinPanel />
        </KerfProvider>,
      );
      const project = store.getState().history?.entries[0]?.project as Project;
      const named = (name: string) => {
        const found = store.getState().solved?.result.placements.find((x) => x.name === name);
        if (!found) throw new Error(`no ${name}`);
        return found;
      };
      return { store, project, named };
    };

    it("tells the user only the form's boards are now custom when the other was drawn by hand", () => {
      const { store, project } = formSetup();
      const ply = project.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";
      const IN = 203_200;
      store
        .getState()
        .apply(
          drawBoard(
            project,
            ply,
            [146_050, IN / 4, 36 * IN],
            { axis: 0, size: 7_023_100 },
            { axis: 1, size: 11 * IN },
          ),
        );
      const now = shownProject(store.getState()) as Project;
      const named = (name: string) =>
        store.getState().solved?.result.placements.find((x) => x.name === name) as PlacedPart;
      act(() =>
        store
          .getState()
          .setProposal(propose(now, loadShopProfile(), named("Right side"), named("Board 1"))),
      );
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      // The two sides are one board in two places: taking the right one takes both.
      expect(store.getState().notice?.text).toBe(
        "Right side and Left side are now custom; the form won't change them.",
      );
    });

    it("says before Accept which boards will become custom, showing a changed name", () => {
      const { store, project, named } = formSetup();
      const proposed = propose(project, loadShopProfile(), named("Right side"), named("Back"));
      act(() =>
        store.getState().setProposal({
          ...proposed,
          result: {
            ok: true,
            type: "dado",
            tool: "dadoStack",
            missing: false,
            description: "Shelf copy 2 in a dado in Back",
            taken: [
              { from: "Shelf 2", to: "Shelf copy 2" },
              { from: "Back", to: "Back" },
            ],
          },
        }),
      );
      expect(
        screen.getByText("Accepting makes Shelf 2 (now Shelf copy 2) and Back custom."),
      ).toBeTruthy();
    });

    it("shows the reason when a form shelf is joined to the thinner back", () => {
      const { store, project, named } = formSetup();
      act(() =>
        store
          .getState()
          .setProposal(propose(project, loadShopProfile(), named("Shelf 1"), named("Back"))),
      );
      expect(screen.getByRole("note").textContent).toBe(
        "Back is thinner than Shelf 1, so Kerf won't cut a joint into it; glue or nail it in place.",
      );
    });

    it("a refused Accept leaves History and the project as they were", () => {
      const { store, project } = formSetup();
      const ply = project.stock.find((s) => s.name === "3/4 plywood")?.id ?? "";
      store
        .getState()
        .apply(
          drawBoard(
            project,
            ply,
            [146_050, 203_200 / 4, 36 * 203_200],
            { axis: 0, size: 7_023_100 },
            { axis: 1, size: 11 * 203_200 },
          ),
        );
      const now = shownProject(store.getState()) as Project;
      const placed = (name: string) =>
        store.getState().solved?.result.placements.find((x) => x.name === name) as PlacedPart;
      const proposed = propose(now, loadShopProfile(), placed("Right side"), placed("Board 1"));
      const { result } = proposed;
      if (!result.ok) throw new Error(result.reason);
      act(() =>
        store.getState().setProposal({
          ...proposed,
          result: { ...result, type: "throughDovetail" },
        }),
      );
      const entries = store.getState().history?.entries.length;
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(store.getState().history?.entries).toHaveLength(entries ?? 0);
      expect(shownProject(store.getState())).toEqual(now);
      expect(store.getState().notice?.text).toBe(
        "Board 1 and Right side do not meet at a right-angle corner, so they cannot be dovetailed.",
      );
    });
  });

  it("says nothing about taking over when both boards were made by hand", () => {
    const { store, project, named } = setup();
    act(() =>
      store
        .getState()
        .setProposal(propose(project, loadShopProfile(), named("Right side"), named("Board 1"))),
    );
    expect(screen.queryByText(/Accepting makes/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(store.getState().notice).toBeNull();
  });

  it("says the boards changed, and clears the proposal, when one is no longer there", () => {
    const { store, project, named } = setup();
    const proposed = propose(project, loadShopProfile(), named("Right side"), named("Board 1"));
    act(() => store.getState().setProposal({ ...proposed, b: "gone" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(store.getState().notice?.text).toBe("Those boards have changed; click them again.");
    expect(store.getState().proposal).toBeNull();
    expect(store.getState().history?.entries).toHaveLength(1);
  });

  it("says the boards changed when asked for the other type with one gone", () => {
    const { store, project, named } = setup();
    const proposed = propose(project, loadShopProfile(), named("Right side"), named("Board 1"));
    act(() => store.getState().setProposal({ ...proposed, a: "gone" }));
    fireEvent.click(screen.getByRole("button", { name: "Use a rabbet instead" }));
    expect(store.getState().notice?.text).toBe("Those boards have changed; click them again.");
    expect(store.getState().proposal).toBeNull();
  });
});
