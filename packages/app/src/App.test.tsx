// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Workflow modules" and "Screen layout"; design spec, "Layout".

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { App } from "./App";
import { startProject } from "./model/commands";
import { STARTER_RECORD } from "./model/shop-record";
import { createStorage } from "./model/storage";
import { createKerfStore, shownProject } from "./model/store";
import { memoryLibrary } from "./testing/memory-library";
import { memoryStorage } from "./testing/memory-storage";
import { workshopStore } from "./testing/workshop-store";
import { boardTool } from "./tools/board";

/** Changes the store the way a click would: inside `act`, so the screen has redrawn afterwards. */
function change(run: () => void): void {
  act(run);
}

/** The Workshop with the bookcase open, as one History entry. */
async function renderApp() {
  const store = await workshopStore();
  render(<App store={store} model={null} />);
  return store;
}

describe("<App>", () => {
  it("shows the Workshop only once a project is open: at first launch it is Your shop", () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    render(<App store={store} model={null} />);
    expect(screen.queryByRole("navigation", { name: "Workflow" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Hang up your tools." })).toBeTruthy();
  });

  it("puts the theme on the page on Home too", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.shop", JSON.stringify(STARTER_RECORD));
    backing.setItem("kerf.theme", "light");
    const store = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
    render(<App store={store} model={null} />);
    expect(store.getState().screen).toBe("home");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("shows Home on a later launch, where a template opens New project and Create starts it in the Workshop", async () => {
    const backing = memoryStorage();
    backing.setItem("kerf.shop", JSON.stringify(STARTER_RECORD));
    const store = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
    render(<App store={store} model={null} />);
    expect(screen.getByRole("heading", { name: "What's on the bench?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Box/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "New project" })).getByRole("button", {
        name: "Create",
      }),
    );
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    // New project's box (model/new-project.ts): a box structure, kept in the library.
    expect(shownProject(store.getState())?.structures[0]?.type).toBe("box");
    expect(store.getState().projects).toHaveLength(1);
  });

  it("shows the four steps, Shape first and pressed", async () => {
    await renderApp();
    const steps = screen.getByRole("navigation", { name: "Workflow" }).querySelectorAll("button");
    expect([...steps].map((b) => b.textContent)).toEqual([
      "Shape",
      "Divide",
      "Joinery",
      "Build plan",
    ]);
    expect(screen.getByRole("button", { name: "Shape" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^Shape — choose how the case is built/)).toBeTruthy();
  });

  it("moves to Divide and shows what Divide is for", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Divide" }));
    expect(screen.getByRole("button", { name: "Divide" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText(/^Divide — click an opening/)).toBeTruthy();
  });

  it("has the project, model and inspector regions", async () => {
    await renderApp();
    expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Model" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
  });

  it("offers Undo only once there is something to undo", async () => {
    const store = await renderApp();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z", async () => {
    const store = await renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().history?.at).toBe(0);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(store.getState().history?.at).toBe(1);
  });

  it("puts a deleted project back from the notice's Undo this, leaving the open one as it was", async () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    await store.getState().createProject(startProject("Blank box", "imperial"), "");
    const box = store.getState().projectId as string;
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    await store.getState().deleteProject(box);
    render(<App store={store} model={null} />);
    expect(screen.getByRole("status").textContent).toContain('Deleted "Blank box".');
    fireEvent.click(screen.getByRole("button", { name: "Undo this" }));
    await waitFor(() =>
      expect(store.getState().projects.map((p) => p.name)).toEqual(["Bookcase", "Blank box"]),
    );
    expect(store.getState().history?.entries).toHaveLength(1);
  });

  it("shows a notice with an Undo this button that undoes the change", async () => {
    const store = await renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store
        .getState()
        .apply(
          startProject("Blank case", "imperial"),
          "Shelf 3 is now custom; the form won't change it",
        );
    });
    expect(screen.getByRole("status").textContent).toContain("Shelf 3 is now custom");
    fireEvent.click(screen.getByRole("button", { name: "Undo this" }));
    expect(store.getState().history?.at).toBe(0);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("leaves Ctrl+Z alone while typing in a field", async () => {
    const store = await renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    const field = document.createElement("input");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "z", ctrlKey: true });
    field.remove();
    expect(store.getState().history?.at).toBe(1);
  });

  describe("after a choice in a select, checkbox or radio", () => {
    /** A control of the kind given, in the page and focused, as after the user picked in it. */
    const focused = (make: () => HTMLElement) => {
      const control = make();
      document.body.append(control);
      control.focus();
      return control;
    };
    const input = (type: string) => () => Object.assign(document.createElement("input"), { type });

    it.each([
      ["select", () => document.createElement("select")],
      ["checkbox", input("checkbox")],
      ["radio", input("radio")],
    ])("undoes with Ctrl+Z from a %s", async (_, make) => {
      const store = await renderApp();
      change(() => {
        store.getState().apply(startProject("Bookcase", "imperial"));
        store.getState().apply(startProject("Blank case", "imperial"));
      });
      const control = focused(make);
      fireEvent.keyDown(control, { key: "z", ctrlKey: true });
      control.remove();
      expect(store.getState().history?.at).toBe(0);
    });

    it.each([
      ["checkbox", input("checkbox")],
      ["radio", input("radio")],
    ])("picks a tool from its key on a %s, but leaves Space to it", async (_, make) => {
      const store = await renderApp();
      const control = focused(make);
      fireEvent.keyDown(control, { key: "p" });
      expect(store.getState().tool).toBe("pushPull");
      fireEvent.keyDown(control, { key: " " });
      control.remove();
      expect(store.getState().tool).toBe("pushPull");
    });

    it("leaves letters and Space to a select, which picks its options by them", async () => {
      const store = await renderApp();
      const control = focused(() => document.createElement("select"));
      fireEvent.keyDown(control, { key: "p" });
      fireEvent.keyDown(control, { key: " " });
      control.remove();
      expect(store.getState().tool).toBe("select");
    });

    it("leaves the arrows to a radio, which moves between its choices by them", async () => {
      const store = await renderApp();
      fireEvent.keyDown(window, { key: "m" });
      const control = focused(input("radio"));
      fireEvent.keyDown(control, { key: "ArrowUp" });
      control.remove();
      expect(store.getState().pending).toBeNull();
    });
  });

  it("undoes with Cmd+Z", async () => {
    const store = await renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(store.getState().history?.at).toBe(0);
  });

  it("turns left-drag into orbit with O, pan with H, and back to picking with Escape", async () => {
    const store = await renderApp();
    fireEvent.keyDown(window, { key: "o" });
    expect(store.getState().navigation).toBe("orbit");
    fireEvent.keyDown(window, { key: "h" });
    expect(store.getState().navigation).toBe("pan");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().navigation).toBeNull();
  });

  it("asks the view to fit the model with Shift+Z, but not Ctrl+Shift+Z", async () => {
    const store = await renderApp();
    fireEvent.keyDown(window, { key: "Z", shiftKey: true });
    expect(store.getState().fitRequest).toBe(1);
    fireEvent.keyDown(window, { key: "z", shiftKey: true, ctrlKey: true });
    expect(store.getState().fitRequest).toBe(1);
  });

  it("puts the theme on the page", async () => {
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("when the 3D view fails", () => {
    /** A model view that throws while drawing, as r3f's Canvas does when WebGL cannot start. */
    function Broken(): never {
      throw new Error("Error creating WebGL context.");
    }

    it("keeps the panels, the drawer and the cut list working, and says what to do", async () => {
      // React reports the caught error on the console; the test is about what the user sees.
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const store = await workshopStore();
      render(<App store={store} model={<Broken />} />);
      quiet.mockRestore();
      expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
      expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Drawer" }).textContent).toMatch(/Cut list/);
      const told =
        "The 3D view could not start in this browser. The cut list, plans and downloading a .kerf file still work; " +
        "to see the model, turn on hardware acceleration or try another browser.";
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe(told);
      expect(screen.getByRole("status").textContent).toContain(told);
    });

    it("does not give WebGL advice for a fault that is not WebGL's", async () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      function Faulty(): never {
        throw new TypeError("x is undefined");
      }
      const store = await workshopStore();
      render(<App store={store} model={<Faulty />} />);
      quiet.mockRestore();
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe(
        "The 3D view hit a problem and stopped. The cut list, plans and downloading a .kerf file still work; " +
          "reload the page to see the model again.",
      );
    });

    it("tries the view again after Undo, so a one-off fault does not end it", async () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      let broken = true;
      function Flaky() {
        if (broken) throw new Error("Error creating WebGL context.");
        return <p>the model</p>;
      }
      const store = await workshopStore();
      store.getState().apply(startProject("Blank case", "imperial"));
      render(<App store={store} model={<Flaky />} />);
      broken = false;
      change(() => store.getState().undo());
      quiet.mockRestore();
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe("the model");
    });
  });

  describe("when Kerf itself fails outside the 3D view", () => {
    const ACTION_FAULT =
      "Kerf hit a problem and could not finish what you just did. Please report it.";
    const WINDOW_FAULT =
      "Kerf hit a problem and can't show its window. Download a .kerf file of your project with the button below, " +
      "then reload the page. Please report the problem.";
    const fault = new TypeError("x is undefined");
    let logged: MockInstance;
    beforeEach(() => {
      logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    /** The bookcase with Board's first click made and a drag previewed, as a tool leaves it. */
    async function midAction() {
      const store = await renderApp();
      change(() => {
        store.getState().apply(startProject("Bookcase", "imperial"));
        store.getState().setTool("board");
        store.getState().setPending({ tool: "board", from: { placed: null, point: [0, 0, 0] } });
        store.getState().preview(startProject("Blank case", "imperial").project);
      });
      return store;
    }

    it("leaves a fault the 3D view's guard handled to that guard: one notice, and the tool's action and preview kept", async () => {
      // The 3D view's renderer (R3F) hands every fault a boundary caught to the page's error event
      // as well (its root's onCaughtError is reportError); here that event is sent by hand.
      const store = await workshopStore();
      store.getState().setTool("board");
      store.getState().setPending({ tool: "board", from: { placed: null, point: [0, 0, 0] } });
      store.getState().preview(startProject("Blank case", "imperial").project);
      // Its own fault: one a boundary caught stays marked as handled.
      const drawing = new TypeError("y is undefined");
      function Broken(): never {
        throw drawing;
      }
      render(<App store={store} model={<Broken />} />);
      act(() => {
        window.dispatchEvent(new ErrorEvent("error", { error: drawing, cancelable: true }));
      });
      expect(store.getState().notice).toEqual({
        text:
          "The 3D view hit a problem and stopped. The cut list, plans and downloading a .kerf file still work; " +
          "reload the page to see the model again.",
        kind: "warning",
      });
      expect(store.getState().waiting).toEqual([]);
      expect(store.getState().pending).toEqual({
        tool: "board",
        from: { placed: null, point: [0, 0, 0] },
      });
      expect(store.getState().previewed).not.toBeNull();
    });

    it("says so when a tool fails on a typed size, logs it, and drops the tool's action and preview", async () => {
      const store = await midAction();
      vi.spyOn(boardTool, "measure").mockImplementation(() => {
        throw fault;
      });
      const box = screen.getByLabelText("Measurements");
      fireEvent.change(box, { target: { value: '24"' } });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(store.getState().notice).toEqual({ text: ACTION_FAULT, kind: "said" });
      expect(logged).toHaveBeenCalledWith(fault);
      expect(store.getState().pending).toBeNull();
      expect(store.getState().previewed).toBeNull();
    });

    it("says so when a panel's button fails, and logs it", async () => {
      const store = await workshopStore();
      // The drawer takes the action when it is drawn, so it fails from the first click.
      vi.spyOn(store.getState(), "setDrawerTab").mockImplementation(() => {
        throw fault;
      });
      render(<App store={store} model={null} />);
      fireEvent.click(screen.getByRole("tab", { name: "Sheets" }));
      expect(store.getState().notice).toEqual({ text: ACTION_FAULT, kind: "said" });
      expect(logged).toHaveBeenCalledWith(fault);
    });

    it("says so when a promise fails with nothing to catch it, and logs it", async () => {
      const store = await renderApp();
      const event = Object.assign(new Event("unhandledrejection", { cancelable: true }), {
        reason: fault,
      });
      act(() => {
        window.dispatchEvent(event);
      });
      expect(store.getState().notice).toEqual({ text: ACTION_FAULT, kind: "said" });
      expect(logged).toHaveBeenCalledWith(fault);
    });

    it("keeps the download and says what to do when a panel fails while it is drawn", async () => {
      const store = await renderApp();
      change(() => store.getState().apply(startProject("Bookcase", "imperial")));
      const solved = store.getState().solved;
      if (!solved) throw new Error("not solved");
      // A cut list missing from the solve: the Cut list tab throws while it draws.
      change(() =>
        store.setState({
          solved: { ...solved, result: { ...solved.result, cutList: undefined as never } },
        }),
      );
      expect(screen.getByText(WINDOW_FAULT)).toBeTruthy();
      const save = screen.getByRole("button", {
        name: "Download a .kerf file",
      }) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
      expect(shownProject(store.getState())).not.toBeNull();
      expect(logged).toHaveBeenCalled();
    });
  });
});
