// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": Open is one History entry and can be undone; a damaged file is refused in
// plain words and the current project stays.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { saveKerfBytes } from "../model/files";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { FileSection } from "./FileSection";
import { KerfProvider } from "./useKerf";

const times = { created: "2026-10-12T10:00:00.000Z", modified: "2026-10-12T11:00:00.000Z" };

function setup() {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  act(() => store.getState().begin(startProject("Bookcase", "imperial")));
  render(
    <KerfProvider store={store}>
      <FileSection />
    </KerfProvider>,
  );
  return store;
}

const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText("Open a .kerf file"), { target: { files: [file] } });

describe("the File section", () => {
  it("opens a .kerf as one History entry that Undo takes back", async () => {
    const store = setup();
    const box = startProject("Blank box", "imperial").project;
    choose(new File([saveKerfBytes(box, times) as BlobPart], "Box.kerf"));
    await waitFor(() =>
      expect(store.getState().history?.entries.at(-1)?.label).toBe("Opened Box.kerf"),
    );
    expect(store.getState().history?.entries).toHaveLength(2);
    act(() => store.getState().undo());
    expect(store.getState().history?.entries).toHaveLength(2);
    expect(store.getState().history?.at).toBe(0);
  });

  it("refuses a damaged file in plain words and keeps the project", async () => {
    const store = setup();
    choose(new File(["not a zip"], "broken.kerf"));
    await waitFor(() =>
      expect(store.getState().notice?.text).toMatch(/^This file could not be opened/),
    );
    expect(store.getState().history?.entries).toHaveLength(1);
  });

  it("has Save off until there is a project", () => {
    const store = createKerfStore({ storage: createStorage(memoryStorage()) });
    render(
      <KerfProvider store={store}>
        <FileSection />
      </KerfProvider>,
    );
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
