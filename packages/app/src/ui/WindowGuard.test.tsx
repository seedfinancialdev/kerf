// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: a fault in Kerf never ends the session silently. When the window cannot be
// drawn, the download still writes the recorded project; a fault in an action is said once and
// logged.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { startProject } from "../model/commands";
import { openKerfBytes } from "../model/files";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { ACTION_FAULT, WindowGuard } from "./WindowGuard";

const fresh = () =>
  createKerfStore({ storage: createStorage(memoryStorage()), library: memoryLibrary() });

function Broken(): never {
  throw new TypeError("x is undefined");
}

const guarded = (store: ReturnType<typeof fresh>, child = <Broken />) =>
  render(
    <KerfProvider store={store}>
      <WindowGuard>{child}</WindowGuard>
    </KerfProvider>,
  );

describe("<WindowGuard>", () => {
  let logged: MockInstance;
  let downloads: Blob[];
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    downloads = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      downloads.push(blob as Blob);
      return "blob:kerf-test";
    };
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  describe("when the window cannot be drawn", () => {
    it("saves the recorded project, not the preview that was on screen", async () => {
      const store = fresh();
      const recorded = startProject("Bookcase", "imperial");
      store.getState().apply(recorded);
      store.getState().preview(startProject("Blank case", "imperial").project);
      guarded(store);
      fireEvent.click(screen.getByRole("button", { name: "Download a .kerf file" }));
      await waitFor(() => expect(downloads).toHaveLength(1));
      const opened = openKerfBytes(new Uint8Array(await (downloads[0] as Blob).arrayBuffer()));
      expect(opened.ok && opened.project).toEqual(recorded.project);
      expect(store.getState().previewed).toBeNull();
    });

    it("says there is nothing to download when no project is open", async () => {
      const store = fresh();
      guarded(store);
      fireEvent.click(screen.getByRole("button", { name: "Download a .kerf file" }));
      await waitFor(() =>
        expect(store.getState().notice).toEqual({
          text: "There is no project to download yet.",
          kind: "said",
        }),
      );
      expect(downloads).toEqual([]);
    });
  });

  describe("when an action fails", () => {
    const fail = (error: Error) =>
      act(() => {
        window.dispatchEvent(new ErrorEvent("error", { error, cancelable: true }));
      });

    it("says so even when dropping the action fails too, and logs both", () => {
      const store = fresh();
      const second = new RangeError("while dropping");
      vi.spyOn(store.getState(), "abandonAction").mockImplementation(() => {
        throw second;
      });
      guarded(store, <p>the window</p>);
      const first = new TypeError("x is undefined");
      fail(first);
      expect(store.getState().notice).toEqual({ text: ACTION_FAULT, kind: "said" });
      expect(logged).toHaveBeenCalledWith(first);
      expect(logged).toHaveBeenCalledWith(second);
    });

    it("says and logs a fault that repeats once for each History entry, as one every frame would", () => {
      const store = fresh();
      store.getState().apply(startProject("Bookcase", "imperial"));
      guarded(store, <p>the window</p>);
      fail(new TypeError("x is undefined"));
      act(() => store.getState().dismissNotice());
      fail(new TypeError("x is undefined"));
      expect(store.getState().notice).toBeNull();
      expect(logged).toHaveBeenCalledTimes(1);
      act(() => store.getState().apply(startProject("Blank case", "imperial")));
      fail(new TypeError("x is undefined"));
      expect(store.getState().notice).toEqual({ text: ACTION_FAULT, kind: "said" });
      expect(logged).toHaveBeenCalledTimes(2);
    });
  });
});
