// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Workflow modules" and "Screen layout"; design spec, "Layout".

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { startProject } from "./model/commands";
import { createStorage } from "./model/storage";
import { createKerfStore } from "./model/store";
import { memoryStorage } from "./testing/memory-storage";

/** Changes the store the way a click would: inside `act`, so the screen has redrawn afterwards. */
function change(run: () => void): void {
  act(run);
}

function renderApp() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  render(<App store={store} model={null} />);
  return store;
}

describe("<App>", () => {
  it("shows the five steps, Start first and pressed", () => {
    renderApp();
    const steps = screen.getByRole("navigation", { name: "Workflow" }).querySelectorAll("button");
    expect([...steps].map((b) => b.textContent)).toEqual([
      "Start",
      "Shape",
      "Divide",
      "Joinery",
      "Build plan",
    ]);
    expect(screen.getByRole("button", { name: "Start" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("moves to Shape and shows what Shape is for", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Shape" }));
    expect(screen.getByRole("button", { name: "Shape" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^Shape — choose how the case is built/)).toBeTruthy();
  });

  it("has the project, model and inspector regions", () => {
    renderApp();
    expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Model" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
  });

  it("offers Undo only once there is something to undo", () => {
    const store = renderApp();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().history?.at).toBe(0);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(store.getState().history?.at).toBe(1);
  });

  it("shows a notice with an Undo this button that undoes the change", () => {
    const store = renderApp();
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

  it("leaves Ctrl+Z alone while typing in a field", () => {
    const store = renderApp();
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

  describe("after a choice in a select, checkbox or radio (final branch review I4)", () => {
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
    ])("undoes with Ctrl+Z from a %s", (_, make) => {
      const store = renderApp();
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
    ])("picks a tool from its key on a %s, but leaves Space to it", (_, make) => {
      const store = renderApp();
      const control = focused(make);
      fireEvent.keyDown(control, { key: "p" });
      expect(store.getState().tool).toBe("pushPull");
      fireEvent.keyDown(control, { key: " " });
      control.remove();
      expect(store.getState().tool).toBe("pushPull");
    });

    it("leaves letters and Space to a select, which picks its options by them", () => {
      const store = renderApp();
      const control = focused(() => document.createElement("select"));
      fireEvent.keyDown(control, { key: "p" });
      fireEvent.keyDown(control, { key: " " });
      control.remove();
      expect(store.getState().tool).toBe("select");
    });

    it("leaves the arrows to a radio, which moves between its choices by them", () => {
      const store = renderApp();
      fireEvent.keyDown(window, { key: "m" });
      const control = focused(input("radio"));
      fireEvent.keyDown(control, { key: "ArrowUp" });
      control.remove();
      expect(store.getState().pending).toBeNull();
    });
  });

  it("undoes with Cmd+Z", () => {
    const store = renderApp();
    change(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
    });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(store.getState().history?.at).toBe(0);
  });

  it("turns left-drag into orbit with O, pan with H, and back to picking with Escape", () => {
    const store = renderApp();
    fireEvent.keyDown(window, { key: "o" });
    expect(store.getState().navigation).toBe("orbit");
    fireEvent.keyDown(window, { key: "h" });
    expect(store.getState().navigation).toBe("pan");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().navigation).toBeNull();
  });

  it("asks the view to fit the model with Shift+Z, but not Ctrl+Shift+Z", () => {
    const store = renderApp();
    fireEvent.keyDown(window, { key: "Z", shiftKey: true });
    expect(store.getState().fitRequest).toBe(1);
    fireEvent.keyDown(window, { key: "z", shiftKey: true, ctrlKey: true });
    expect(store.getState().fitRequest).toBe(1);
  });

  it("puts the theme on the page", () => {
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("when the 3D view fails (silent-failure review C1)", () => {
    /** A model view that throws while drawing, as r3f's Canvas does when WebGL cannot start. */
    function Broken(): never {
      throw new Error("Error creating WebGL context.");
    }

    it("keeps the panels, the drawer and the cut list working, and says what to do", () => {
      // React reports the caught error on the console; the test is about what the user sees.
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const store = createKerfStore({ storage: createStorage(memoryStorage()) });
      store.getState().apply(startProject("Bookcase", "imperial"));
      render(<App store={store} model={<Broken />} />);
      quiet.mockRestore();
      expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
      expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Drawer" }).textContent).toMatch(/Cut list/);
      const told =
        "The 3D view could not start in this browser. The cut list, plans and Save still work; " +
        "to see the model, turn on hardware acceleration or try another browser.";
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe(told);
      expect(screen.getByRole("status").textContent).toContain(told);
    });

    it("does not give WebGL advice for a fault that is not WebGL's (second-pass review M3)", () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      function Faulty(): never {
        throw new TypeError("x is undefined");
      }
      const store = createKerfStore({ storage: createStorage(memoryStorage()) });
      render(<App store={store} model={<Faulty />} />);
      quiet.mockRestore();
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe(
        "The 3D view hit a problem and stopped. The cut list, plans and Save still work; " +
          "reload the page to see the model again.",
      );
    });

    it("tries the view again after Undo, so a one-off fault does not end it (re-review N5)", () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      let broken = true;
      function Flaky() {
        if (broken) throw new Error("Error creating WebGL context.");
        return <p>the model</p>;
      }
      const store = createKerfStore({ storage: createStorage(memoryStorage()) });
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().apply(startProject("Blank case", "imperial"));
      render(<App store={store} model={<Flaky />} />);
      broken = false;
      change(() => store.getState().undo());
      quiet.mockRestore();
      expect(screen.getByRole("region", { name: "Model" }).textContent).toBe("the model");
    });
  });
});
