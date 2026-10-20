// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2 and §3, Open file: a picked .kerf file is added as a new project. A file the
// browser will not hand over is said in plain words; a fault in Kerf is never mistaken for one.

import type { ChangeEvent } from "react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { saveKerfBytes } from "../model/files";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { addPickedFile } from "./open-file";

/** A store on Home with no projects. */
function homeStore() {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  store.getState().setScreen("home");
  return store;
}

/** The change event of a file chooser that picked `file`, and the chooser. */
function picked(file: File): { event: ChangeEvent<HTMLInputElement>; input: HTMLInputElement } {
  const input = document.createElement("input");
  input.type = "file";
  Object.defineProperty(input, "files", { value: [file] });
  Object.defineProperty(input, "value", { value: "C:\\fakepath\\Box.kerf", writable: true });
  return { event: { target: input } as unknown as ChangeEvent<HTMLInputElement>, input };
}

describe("addPickedFile()", () => {
  it("adds the file picked as a new project, and clears the chooser", async () => {
    const store = homeStore();
    const bytes = saveKerfBytes(startProject("Keepsake box", "imperial").project, {
      created: "2026-10-14T09:00:00.000Z",
      modified: "2026-10-14T09:00:00.000Z",
    });
    const { event, input } = picked(new File([bytes as BlobPart], "Box.kerf"));
    await addPickedFile(store, event);
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Keepsake box"]);
    expect(input.value).toBe("");
  });

  it("says plainly when the browser will not hand the file over, and adds nothing", async () => {
    const store = homeStore();
    const file = new File(["x"], "Box.kerf");
    // A file moved or deleted after it was picked: the browser refuses to read it.
    file.arrayBuffer = () => Promise.reject(new DOMException("gone", "NotReadableError"));
    const { event, input } = picked(file);
    await addPickedFile(store, event);
    expect(store.getState().notice?.text).toBe(
      "This file could not be read from your computer; try opening it again.",
    );
    expect(store.getState().projects).toEqual([]);
    expect(input.value).toBe("");
  });

  it("lets a fault in Kerf through to be reported as one, never as a file it could not read", async () => {
    const store = homeStore();
    // Stands in for a fault inside Kerf while the file is added: one cannot be caused on purpose.
    const fault = new TypeError("a fault in Kerf");
    store.setState({
      addFile: async () => {
        throw fault;
      },
    });
    const { event } = picked(new File(["x"], "Box.kerf"));
    await expect(addPickedFile(store, event)).rejects.toBe(fault);
    expect(store.getState().notice).toBeNull();
    expect(store.getState().projects).toEqual([]);
  });
});
