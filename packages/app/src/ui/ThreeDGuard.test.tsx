// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Silent-failure review C1: a failure of the 3D view or the geometry engine stays where it
// happened and the user is told once, in shop words, what still works and what to try.

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { ThreeDGuard } from "./ThreeDGuard";

function Broken(): never {
  throw new WebAssembly.RuntimeError("unreachable");
}

describe("<ThreeDGuard>", () => {
  let quiet: MockInstance;
  // React reports a caught error on the console; these tests are about what the user sees.
  beforeEach(() => {
    quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => quiet.mockRestore());

  const told =
    "The 3D view could not start (unreachable). The cut list, plans and Save still work; " +
    "to see the model, turn on hardware acceleration or try another browser.";

  it("draws nothing in place of a part that failed, and warns once on the notice line", () => {
    const store = createKerfStore({ storage: createStorage(memoryStorage()) });
    render(
      <KerfProvider store={store}>
        <p>Length 34-9/16"</p>
        <ThreeDGuard>
          <Broken />
        </ThreeDGuard>
        <ThreeDGuard>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    expect(screen.getByText('Length 34-9/16"')).toBeTruthy();
    expect(screen.queryByText(told)).toBeNull();
    expect(store.getState().notice).toEqual({ text: told, kind: "warning" });
    expect(store.getState().waiting).toEqual([]);
  });

  it("shows the reason in place of the view when asked to", () => {
    const store = createKerfStore({ storage: createStorage(memoryStorage()) });
    render(
      <KerfProvider store={store}>
        <ThreeDGuard showsFailure>
          <Broken />
        </ThreeDGuard>
      </KerfProvider>,
    );
    expect(screen.getByText(told)).toBeTruthy();
  });
});
