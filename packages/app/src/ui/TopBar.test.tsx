// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Tooltips": every control has one, including Undo and Redo while there is
// nothing to undo.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "../App";
import { startProject } from "../model/commands";
import { startHistory } from "../model/history";
import type { LibraryEntry } from "../model/library";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { workshopStore } from "../testing/workshop-store";
import { saveShownProject } from "./save";

vi.mock("./save", async (original) => ({
  ...(await original<typeof import("./save")>()),
  saveShownProject: vi.fn(async () => undefined),
}));

async function openApp() {
  const store = await workshopStore();
  render(<App store={store} model={null} />);
  return store;
}

describe("<TopBar> tips", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("names Undo while it is disabled, since a disabled button gets no pointer events", async () => {
    render(<App store={await workshopStore()} model={null} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.hasAttribute("disabled")).toBe(true);
    // The pointer enters the wrapper around the button, which is what a browser reports.
    fireEvent.pointerEnter(undo.parentElement as HTMLElement);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toContain("Take back your last change.");
  });

  it("shows Redo's tip when Tab reaches it", async () => {
    const store = await openApp();
    act(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
      store.getState().undo();
    });
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("button", { name: "Redo" }).focus());
    expect(screen.getByRole("tooltip").textContent).toContain("Put back the change");
  });

  it("describes Shape for the kind of project that is open", async () => {
    const store = await openApp();
    act(() => {
      store.getState().apply(startProject("Blank box", "imperial"));
      store.getState().setStep("Divide");
    });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Shape" }));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toContain("how the box is built");
  });
});

describe("<TopBar> Kerf button and project menu", () => {
  const openMenu = async () => {
    const user = userEvent.setup();
    const store = await openApp();
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    return { user, store };
  };

  it("goes Home from the Kerf button, and the project is in Recent files", async () => {
    const user = userEvent.setup();
    const store = await openApp();
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(store.getState().screen).toBe("home");
    expect(store.getState().projects.map((p) => p.name)).toContain("Bookcase");
  });

  it("gives the Kerf button the Home tip when Tab reaches it", async () => {
    await openApp();
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("button", { name: "Home" }).focus());
    expect(screen.getByRole("tooltip").textContent).toContain("Home");
  });

  it("lists Rename, Duplicate, Download .kerf file and Back to Home, and no Delete", async () => {
    await openMenu();
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Download .kerf file",
      "Back to Home",
    ]);
  });

  it("renames in place: the new name is in the top bar and in the library", async () => {
    const { user, store } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Name" });
    await user.clear(field);
    await user.type(field, "Hall shelves{Enter}");
    expect(screen.getByRole("button", { name: "Hall shelves" })).toBeTruthy();
    await waitFor(() =>
      expect(store.getState().projects.map((p) => p.name)).toEqual(["Hall shelves"]),
    );
  });

  it("leaves the name alone on Escape and gives the keyboard back to the name button", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bookcase" }));
  });

  it("downloads the shown project", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Download .kerf file" }));
    expect(vi.mocked(saveShownProject)).toHaveBeenCalledTimes(1);
  });

  it("duplicates, says where the copy is, and stays in the workshop", async () => {
    const { user, store } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(store.getState().notice?.text).toBe('Made "Bookcase copy" on Home.'),
    );
    expect(store.getState().screen).toBe("workshop");
    expect(store.getState().projects.map((p) => p.name)).toContain("Bookcase copy");
  });

  it("refuses a blank name, says why, and keeps the field open", async () => {
    const { user, store } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("{Enter}");
    expect(store.getState().notice?.text).toBe("Give the project a name.");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
  });

  it("gives the keyboard back to the name button after Enter", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), " two{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bookcase two" }));
  });

  it("leaves the keyboard on what was clicked when the name field is left by a click", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), " two");
    const tool = within(screen.getByRole("toolbar", { name: "Tools" })).getAllByRole("button")[1];
    await user.click(tool as HTMLElement);
    expect(document.activeElement).toBe(tool);
    expect(screen.getByRole("button", { name: "Bookcase two" })).toBeTruthy();
  });

  it("makes no History step when the same name is typed again", async () => {
    const { user, store } = await openMenu();
    const before = store.getState().history?.entries.length;
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.keyboard("{Enter}");
    expect(store.getState().history?.entries.length).toBe(before);
  });

  it("shows the name button as a menu, with a tip", async () => {
    await openApp();
    const name = screen.getByRole("button", { name: "Bookcase" });
    expect(name.getAttribute("aria-haspopup")).toBe("menu");
    expect(name.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => name.focus());
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Rename, copy or download this project",
    );
  });

  it("shows Duplicate disabled, with a tip, when the browser keeps no projects", async () => {
    const user = userEvent.setup();
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary({ available: false }),
    });
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    render(<App store={store} model={null} />);
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    const copy = screen.getByRole("menuitem", { name: "Duplicate" });
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    const duplicate = vi.fn(async () => undefined);
    act(() => store.setState({ duplicateProject: duplicate }));
    const noticeBefore = store.getState().notice;
    await user.click(copy);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(duplicate).not.toHaveBeenCalled();
    expect(store.getState().notice).toEqual(noticeBefore);
    expect(store.getState().projects).toHaveLength(0);
    act(() => copy.blur());
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => copy.focus());
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Copies need a browser that keeps projects.",
    );
  });

  it("puts the disabled Duplicate's tip beside the menu, off the items below it", async () => {
    // A 1000 x 700 window, a 200 x 50 tip, and every other box 160 x 30 at (100, 100).
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 700);
    const boxes = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const box = this.classList.contains("tip")
          ? { left: 0, top: 0, width: 200, height: 50 }
          : { left: 100, top: 100, width: 160, height: 30 };
        return { ...box, right: box.left + box.width, bottom: box.top + box.height } as DOMRect;
      });
    onTestFinished(() => {
      boxes.mockRestore();
      vi.unstubAllGlobals();
    });
    const user = userEvent.setup();
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary({ available: false }),
    });
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    render(<App store={store} model={null} />);
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("menuitem", { name: "Duplicate" }).focus());
    const tip = screen.getByRole("tooltip");
    // To the right of the item, level with its top: left = 100 + 160 + 6 = 266, top = 100.
    expect([tip.style.left, tip.style.top]).toEqual(["266px", "100px"]);
  });

  it("marks the name button expanded while its menu is open", async () => {
    const { user } = await openMenu();
    const name = screen.getByRole("button", { name: "Bookcase" });
    expect(name.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(name.getAttribute("aria-expanded")).toBe("false");
  });

  it("lets the library's own words say why no copy was made, when it cannot be read", async () => {
    const user = userEvent.setup();
    const library = { ...memoryLibrary(), read: async () => undefined };
    const store = createKerfStore({ storage: createStorage(memoryStorage()), library });
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    render(<App store={store} model={null} />);
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(store.getState().notice?.text).toBe(
        "This project could not be found in this browser.",
      ),
    );
  });

  it("lets the library's own words say why no copy was made, when it will not keep one", async () => {
    const user = userEvent.setup();
    const inner = memoryLibrary();
    let full = false;
    const library = {
      ...inner,
      write: (e: LibraryEntry) => (full ? Promise.resolve(false) : inner.write(e)),
    };
    const store = createKerfStore({ storage: createStorage(memoryStorage()), library });
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    full = true;
    render(<App store={store} model={null} />);
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(store.getState().notice?.text).toBe('"Bookcase" could not be copied in this browser.'),
    );
  });

  it("renames the open project the library did not take, as a change Undo takes back", async () => {
    const user = userEvent.setup();
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary({ available: false }),
      migration: {
        outcome: "refused",
        history: startHistory(startProject("Bookcase", "imperial")),
      },
    });
    store.getState().setScreen("workshop");
    render(<App store={store} model={null} />);
    await user.click(screen.getByRole("button", { name: "Bookcase" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Name" });
    await user.clear(field);
    await user.type(field, "Alcove{Enter}");
    expect(screen.getByRole("button", { name: "Alcove" })).toBeTruthy();
    act(() => store.getState().undo());
    expect(screen.getByRole("button", { name: "Bookcase" })).toBeTruthy();
  });

  it("goes Home from Back to Home", async () => {
    const { user, store } = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Back to Home" }));
    expect(store.getState().screen).toBe("home");
  });
});
