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
import { bookcaseWithShelf } from "../testing/bookcase-with-shelf";
import { memoryStorage } from "../testing/memory-storage";
import { KerfProvider } from "../ui/useKerf";
import { drawBoard } from "./board";
import { JoinPanel } from "./JoinPanel";
import { acceptProposal, propose } from "./join";

afterEach(cleanup);

function setup() {
  const project = bookcaseWithShelf();
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
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
      const store = createKerfStore({ storage: createStorage(memoryStorage()) });
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

    it("tells the user both boards are now custom, and detaches them", () => {
      const { store, project, named } = formSetup();
      const proposed = propose(project, loadShopProfile(), named("Top"), named("Back"));
      act(() => store.getState().setProposal(proposed));
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(store.getState().notice?.text).toBe(
        "Top and Back are now custom; the form won't change them.",
      );
      const after = store.getState().solved?.result.placements ?? [];
      expect(after.find((x) => x.name === "Top")?.detached).toBe(true);
      expect(after.find((x) => x.name === "Back")?.detached).toBe(true);
    });

    it("tells the user only the form board is now custom when the other was drawn by hand", () => {
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
      expect(store.getState().notice?.text).toBe(
        "Right side is now custom; the form won't change it.",
      );
    });

    it("a refused Accept leaves History and the project as they were", () => {
      const { store, project, named } = formSetup();
      const proposed = propose(project, loadShopProfile(), named("Top"), named("Back"));
      const { result } = proposed;
      if (!result.ok) throw new Error(result.reason);
      act(() =>
        store.getState().setProposal({
          ...proposed,
          result: { ...result, joint: { ...result.joint, type: "throughDovetail" } },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(store.getState().history?.entries).toHaveLength(1);
      expect(shownProject(store.getState())).toEqual(project);
      expect(store.getState().notice?.text).toBe(
        "Top and Back do not meet at a right-angle corner, so they cannot be dovetailed.",
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
