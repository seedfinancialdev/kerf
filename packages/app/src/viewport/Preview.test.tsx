// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3: New project shows "a live 3D preview of the real model, drawn by the engine". A
// preview that cannot be drawn never stops the piece being created: it says so in its place.
// jsdom has no WebGL, so the canvas here never starts drawing (the e2e tests see the picture); the
// geometry engine's load is stood in for so its failure can be tested (a real one cannot be made
// to fail on purpose).

import { solve } from "@kerf/core";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { startProject } from "../model/commands";
import { STARTER_RECORD, shopProfileFor } from "../model/shop-record";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { PREVIEW_NOT_DRAWN, Preview } from "./Preview";

const geometry = vi.hoisted(() => ({ ready: false, failed: false }));
vi.mock("./useGeometry", () => ({ useGeometry: () => geometry }));

const project = startProject("Bookcase", "imperial").project;
const result = solve(project, shopProfileFor(STARTER_RECORD));

function preview() {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  render(
    <KerfProvider store={store}>
      <Preview project={project} result={result} />
    </KerfProvider>,
  );
  return store;
}

describe("<Preview>", () => {
  let console_: MockInstance;
  // React and the guard report a caught fault on the console; these tests are about what is seen.
  beforeEach(() => {
    console_ = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.assign(geometry, { ready: false, failed: false });
  });
  afterEach(() => {
    console_.mockRestore();
    vi.unstubAllGlobals();
  });

  it("draws the starter bookcase in a section called Preview of your piece", () => {
    preview();
    const section = screen.getByRole("region", { name: "Preview of your piece" });
    expect(section.querySelector("canvas")).not.toBeNull();
    expect(screen.queryByText(PREVIEW_NOT_DRAWN)).toBeNull();
  });

  it("says the piece can still be created when the geometry engine cannot start", () => {
    Object.assign(geometry, { ready: false, failed: true });
    preview();
    const section = screen.getByRole("region", { name: "Preview of your piece" });
    expect(section.textContent).toBe(
      "The preview couldn't be drawn, but you can still create the piece.",
    );
    expect(section.querySelector("canvas")).toBeNull();
  });

  it("says the same, without taking the panel down, when the 3D view itself cannot start", () => {
    // Without ResizeObserver the canvas throws while it is drawn, as a browser without it would.
    vi.stubGlobal("ResizeObserver", undefined);
    const store = preview();
    expect(screen.getByRole("region", { name: "Preview of your piece" }).textContent).toBe(
      PREVIEW_NOT_DRAWN,
    );
    // The preview's own words are enough: nothing is left on the notice line for after the panel.
    expect(store.getState().notice).toBeNull();
    expect(console_).toHaveBeenCalled();
  });
});
