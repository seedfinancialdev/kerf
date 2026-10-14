// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A failure of the 3D view or the geometry engine stays where it happened; the user is told once,
// in shop words, what still works and what to try for that cause; the raw error goes to the
// console only; and a one-off fault does not take the view away for the rest of the session.

import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { BOARD_FAULT, ThreeDGuard, VIEW_NOT_STARTED } from "./ThreeDGuard";

const fault = new WebAssembly.RuntimeError("unreachable");
function Broken(): never {
  throw fault;
}

const fresh = () => createKerfStore({ storage: createStorage(memoryStorage()) });

describe("<ThreeDGuard>", () => {
  let console_: MockInstance;
  // React reports a caught error on the console too; these tests are about what the user sees.
  beforeEach(() => {
    console_ = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => console_.mockRestore());

  it("draws its fallback in place of a part that failed, warns once in shop words, and logs the raw error", () => {
    const store = fresh();
    render(
      <KerfProvider store={store}>
        <p>Length 34-9/16"</p>
        <ThreeDGuard told={BOARD_FAULT} fallback={<p>plain board</p>}>
          <Broken />
        </ThreeDGuard>
        <ThreeDGuard told={BOARD_FAULT}>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    expect(screen.getByText('Length 34-9/16"')).toBeTruthy();
    expect(screen.getByText("plain board")).toBeTruthy();
    expect(store.getState().notice).toEqual({ text: BOARD_FAULT, kind: "warning" });
    expect(store.getState().waiting).toEqual([]);
    expect(store.getState().notice?.text).not.toContain("unreachable");
    expect(console_).toHaveBeenCalledWith(fault);
  });

  it("gives each cause its own advice in shop words", () => {
    expect(VIEW_NOT_STARTED).toBe(
      "The 3D view could not start in this browser. The cut list, plans and Save still work; " +
        "to see the model, turn on hardware acceleration or try another browser.",
    );
    expect(BOARD_FAULT).toBe(
      "A board could not be drawn, so it is shown plain. Everything else still works.",
    );
  });

  it("does not warn again for the same fault after the user dismissed it", () => {
    const store = fresh();
    const first = render(
      <KerfProvider store={store}>
        <ThreeDGuard told={BOARD_FAULT}>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    act(() => store.getState().dismissNotice());
    first.unmount();
    // The inspector mounts a new guard each time boards are picked again.
    render(
      <KerfProvider store={store}>
        <ThreeDGuard told={BOARD_FAULT}>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    expect(store.getState().notice).toBeNull();
  });

  it("tries again when the project changes, so a one-off fault does not end the view", () => {
    // React tries a failed render again at once, so the fault lasts until the test clears it.
    let broken = true;
    function OnceBroken() {
      if (broken) throw fault;
      return <p>the model</p>;
    }
    function Harness() {
      const [project, setProject] = useState(1);
      return (
        <>
          <button type="button" onClick={() => setProject(project + 1)}>
            Undo
          </button>
          <ThreeDGuard told={VIEW_NOT_STARTED} retryOn={project} fallback={<p>no view</p>}>
            <OnceBroken />
          </ThreeDGuard>
        </>
      );
    }
    render(
      <KerfProvider store={fresh()}>
        <Harness />
      </KerfProvider>,
    );
    expect(screen.getByText("no view")).toBeTruthy();
    broken = false;
    act(() => screen.getByRole("button", { name: "Undo" }).click());
    expect(screen.getByText("the model")).toBeTruthy();
  });

  it("tells its owner which part failed, so a board drawn plain can say why", () => {
    const failed = vi.fn();
    render(
      <KerfProvider store={fresh()}>
        <ThreeDGuard told={BOARD_FAULT} onFault={failed}>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
