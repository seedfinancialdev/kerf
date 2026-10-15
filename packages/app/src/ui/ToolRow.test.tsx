// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// "Icons always carry text labels" (Interaction spec); keys as SketchUp.

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { startProject } from "../model/commands";
import { workshopStore } from "../testing/workshop-store";

function setup() {
  const store = workshopStore();
  render(<App store={store} model={null} />);
  return store;
}

describe("<ToolRow>", () => {
  it("shows each tool's name and key", () => {
    setup();
    expect(screen.getByRole("button", { name: "Edge profile F" })).toBeTruthy();
  });

  it("picks a tool from its key, and Escape goes back to Select and clears the selection", () => {
    const store = setup();
    act(() => store.getState().select({ kind: "boards", instances: ["a"] }));
    fireEvent.keyDown(window, { key: "p" });
    expect(store.getState().tool).toBe("pushPull");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().tool).toBe("select");
    expect(store.getState().selection).toEqual({ kind: "none" });
  });

  it("drops a drag's preview on Escape, so nothing unrecorded stays on screen", () => {
    const store = setup();
    act(() => store.getState().apply(startProject("Bookcase", "imperial")));
    const recorded = store.getState().solved;
    act(() => {
      store.getState().setTool("move");
      store.getState().preview(startProject("Blank case", "imperial").project);
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().previewed).toBeNull();
    expect(store.getState().solved?.result.placements).toEqual(recorded?.result.placements);
  });

  it("leaves E alone and keeps the navigation keys working", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "e" });
    expect(store.getState().tool).toBe("select");
    fireEvent.keyDown(window, { key: "o" });
    expect(store.getState().navigation).toBe("orbit");
  });

  it("ignores tool keys while typing in a field", () => {
    const store = setup();
    const input = screen.getByLabelText("Measurements");
    fireEvent.keyDown(input, { key: "p" });
    expect(store.getState().tool).toBe("select");
  });

  it("marks the active tool pressed when its button is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Tape T" }));
    expect(screen.getByRole("button", { name: "Tape T" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("refuses typed text for a tool that takes no size, in plain words", () => {
    setup();
    const input = screen.getByLabelText("Measurements");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("This tool takes no typed size.")).toBeTruthy();
  });

  it("leaves Space to a focused button, and still selects Select from the window", () => {
    const store = setup();
    act(() => store.getState().setTool("move"));
    const button = screen.getByRole("button", { name: "Tape T" });
    button.focus();
    fireEvent.keyDown(button, { key: " " });
    expect(store.getState().tool).toBe("move");
    fireEvent.keyDown(window, { key: " " });
    expect(store.getState().tool).toBe("select");
  });
});

describe("<Measurements>", () => {
  const typeIn = (value: string) => {
    const input = screen.getByLabelText("Measurements");
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
    return input;
  };

  it("shows a refusal as an alert tied to the box", () => {
    setup();
    const input = typeIn("3");
    const alert = screen.getByRole("alert");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("clears the refusal when the text is edited", () => {
    setup();
    const input = typeIn("3");
    fireEvent.change(input, { target: { value: "30" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the refusal when the tool changes", () => {
    const store = setup();
    typeIn("3");
    act(() => store.getState().setTool("tape"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does nothing on Enter with nothing typed", () => {
    setup();
    typeIn("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets go of the keyboard on Escape, so tool keys work again", () => {
    const store = setup();
    const input = screen.getByLabelText("Measurements");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).not.toBe(input);
    expect(store.getState().tool).toBe("select");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(store.getState().tool).toBe("pushPull");
  });
});

describe("a size typed anywhere (Interaction spec, Measurements)", () => {
  /**
   * The bookcase, Push/Pull picked, and the Top's right end clicked: the tool waits for a distance.
   */
  function waiting() {
    const store = setup();
    act(() => {
      store.getState().apply(startProject("Bookcase", "imperial"));
      store.getState().setTool("pushPull");
    });
    const top = store.getState().solved?.result.placements.find((p) => p.partName === "Top");
    if (!top) throw new Error("no top");
    act(() =>
      store.getState().setPending({
        tool: "pushPull",
        hit: { placed: top, point: [0, 0, 0], normal: top.frame.x },
        dragged: null,
        ray: null,
      }),
    );
    return { store, top };
  }
  const box = () => screen.getByLabelText("Measurements") as HTMLInputElement;

  it('goes to the Measurements box, so 2" Enter lengthens the clicked end by 2"', async () => {
    const { store } = waiting();
    await userEvent.keyboard('2"{Enter}');
    // The Top is 34-9/16" (7023100); 2" more is 36-9/16" (7429500).
    expect(store.getState().history?.entries.at(-1)?.label).toBe('Lengthened Top by 2"');
    expect(
      store.getState().solved?.result.placements.find((p) => p.partName === "Top")?.size.length,
    ).toBe(7_429_500);
  });

  it('gives the keyboard back after 2" Enter, so a tool letter picks the tool', async () => {
    const { store } = waiting();
    await userEvent.keyboard('2"{Enter}m');
    expect(document.activeElement).not.toBe(box());
    expect(box().value).toBe("");
    expect(store.getState().tool).toBe("move");
  });

  it('gives the keyboard back after 2" Enter, so Ctrl+Z undoes the change', async () => {
    const { store } = waiting();
    await userEvent.keyboard('2"{Enter}{Control>}z{/Control}');
    // Undone: the Top is back to 34-9/16" (7023100), and the redo entry is the change.
    expect(store.getState().history?.entries.at(-1)?.label).toBe('Lengthened Top by 2"');
    expect(
      store.getState().solved?.result.placements.find((p) => p.partName === "Top")?.size.length,
    ).toBe(7_023_100);
  });

  it("keeps the keyboard in the box after a refusal, so the size can be corrected", async () => {
    waiting();
    await userEvent.keyboard("2x{Enter}");
    expect(document.activeElement).toBe(box());
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it.each(["2", "-", ".", "/", "'", '"'])(
    "starts the box with %s and gives it the keyboard",
    (key) => {
      waiting();
      fireEvent.keyDown(document.body, { key });
      expect(document.activeElement).toBe(box());
      expect(box().value).toBe(key);
    },
  );

  it.each(["ctrlKey", "metaKey", "altKey"])(
    "leaves a digit held with %s to the shortcut it makes",
    (modifier) => {
      waiting();
      fireEvent.keyDown(document.body, { key: "1", [modifier]: true });
      expect(document.activeElement).not.toBe(box());
      expect(box().value).toBe("");
    },
  );

  it("leaves the tool keys to pick tools", () => {
    const { store } = waiting();
    fireEvent.keyDown(document.body, { key: "m" });
    expect(store.getState().tool).toBe("move");
    expect(document.activeElement).not.toBe(box());
  });

  it("does nothing while no tool waits for a size", () => {
    const store = setup();
    act(() => store.getState().apply(startProject("Bookcase", "imperial")));
    act(() => store.getState().setTool("pushPull"));
    fireEvent.keyDown(document.body, { key: "2" });
    act(() => {
      store.getState().setTool("join");
      store.getState().setPending({ tool: "join", first: "a" });
    });
    fireEvent.keyDown(document.body, { key: "2" });
    expect(document.activeElement).not.toBe(box());
    expect(box().value).toBe("");
  });

  it("leaves a key typed in another field to that field", () => {
    waiting();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    fireEvent.keyDown(field, { key: "2" });
    field.remove();
    expect(box().value).toBe("");
  });
});

describe("the arrow keys while moving", () => {
  it("lock the direction: right is x, left is y, up is z", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "m" });
    for (const [key, axis] of [
      ["ArrowRight", 0],
      ["ArrowLeft", 1],
      ["ArrowUp", 2],
    ] as const) {
      fireEvent.keyDown(window, { key });
      expect(store.getState().pending).toMatchObject({ tool: "move", axis });
    }
  });

  it("keep the boards and start of a drag already under way", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "m" });
    act(() =>
      store.getState().setPending({
        tool: "move",
        axis: null,
        drag: { from: [1, 2, 3], placed: [], last: "a", ray: null },
      }),
    );
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(store.getState().pending).toEqual({
      tool: "move",
      axis: 2,
      drag: { from: [1, 2, 3], placed: [], last: "a", ray: null },
    });
  });

  it("let go of the lock when the same arrow is pressed again", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(store.getState().pending).toMatchObject({ tool: "move", axis: null });
  });

  it("are left to the tree, a list, a tab or a button when one has the keyboard", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "m" });
    for (const role of ["treeitem", "option", "tab", "button", "toolbar"]) {
      const widget = document.createElement("div");
      widget.setAttribute("role", role);
      document.body.append(widget);
      fireEvent.keyDown(widget, { key: "ArrowUp" });
      widget.remove();
    }
    expect(store.getState().pending).toBeNull();
  });

  it("do nothing in other tools, and are left to a field being typed in", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(store.getState().pending).toBeNull();
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(screen.getByLabelText("Measurements"), { key: "ArrowUp" });
    expect(store.getState().pending).toBeNull();
  });

  it("are dropped with the tool, so a lock does not outlive the move", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().pending).toBeNull();
  });
});

describe("tool tips (design spec, Tooltips)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the key and what Push/Pull does after half a second on its button", () => {
    setup();
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Push/Pull P" }));
    act(() => vi.advanceTimersByTime(500));
    const tip = screen.getByRole("tooltip");
    expect(tip.querySelector("kbd")?.textContent).toBe("P");
    expect(tip.textContent).toContain("Stretch or shrink");
  });
});
