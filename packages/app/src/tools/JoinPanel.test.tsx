// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Join": the proposal is shown with Accept; a refusal shows its reason.

import { solve } from "@kerf/core";
import { loadShopProfile } from "@kerf/fixtures";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { bookcaseWithShelf } from "../testing/bookcase-with-shelf";
import { memoryStorage } from "../testing/memory-storage";
import { KerfProvider } from "../ui/useKerf";
import { JoinPanel } from "./JoinPanel";
import { propose } from "./join";

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
});
