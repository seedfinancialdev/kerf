// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "The flow": the browser's Back button moves between Home, Your shop and the
// Workshop.

import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { KerfProvider } from "./useKerf";
import { useScreenHistory } from "./useScreenHistory";

function Follows() {
  useScreenHistory();
  return null;
}

/** A store at first launch (on Your shop), with the hook following it. */
function setup(): KerfStore {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  render(
    <KerfProvider store={store}>
      <Follows />
    </KerfProvider>,
  );
  return store;
}

const goBack = (state: unknown) =>
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });

describe("useScreenHistory()", () => {
  it("names the screen the page opened on, so Back to the first page lands there again", () => {
    const before = window.history.length;
    setup();
    expect(window.history.state).toEqual({ screen: "shop" });
    expect(window.history.length).toBe(before);
  });

  it("pushes a browser history entry naming the screen when the app changes it", () => {
    const store = setup();
    const before = window.history.length;
    act(() => store.getState().setScreen("home"));
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ screen: "home" });
  });

  it("sets the screen a Back or Forward lands on, without pushing another entry", () => {
    const store = setup();
    act(() => store.getState().setScreen("home"));
    const before = window.history.length;
    goBack({ screen: "shop" });
    expect(store.getState().screen).toBe("shop");
    expect(window.history.length).toBe(before);
  });

  it("names the screen it landed on when the entry's screen cannot be shown", () => {
    const store = setup();
    goBack({ screen: "workshop" });
    expect(store.getState().screen).toBe("home");
    expect(window.history.state).toEqual({ screen: "home" });
  });

  it("goes Home from an entry that names no screen", () => {
    const store = setup();
    goBack(null);
    expect(store.getState().screen).toBe("home");
  });

  it("goes Home from an entry that names something that is not a screen", () => {
    const store = setup();
    goBack({ screen: "attic" });
    expect(store.getState().screen).toBe("home");
  });
});
