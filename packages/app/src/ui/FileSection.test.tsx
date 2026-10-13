// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": Open is one History entry and can be undone; a damaged file is refused in
// plain words and the current project stays.

import { readKerf } from "@kerf/io";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannedWordsIn } from "../../e2e/support/banned-words";
import { startProject } from "../model/commands";
import { openKerfBytes, saveKerfBytes } from "../model/files";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { memoryStorage } from "../testing/memory-storage";
import { FileSection } from "./FileSection";
import { KerfProvider } from "./useKerf";

const times = { created: "2026-10-12T10:00:00.000Z", modified: "2026-10-12T11:00:00.000Z" };

const NOW = new Date("2026-10-13T08:30:00.000Z");

function setup() {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    clockDate: () => Date.parse(times.created),
  });
  act(() => store.getState().begin(startProject("Bookcase", "imperial")));
  render(
    <KerfProvider store={store}>
      <FileSection now={() => NOW} />
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

  it("says plainly when the file cannot be read, and keeps the project", async () => {
    const store = setup();
    const file = new File(["x"], "Box.kerf");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("disk gone"));
    choose(file);
    await waitFor(() => expect(store.getState().notice?.text).toBe("This file could not be read."));
    expect(store.getState().history?.entries).toHaveLength(1);
  });
});

describe("Save", () => {
  const saved: { blobs: Blob[]; names: string[]; revoked: string[] } = {
    blobs: [],
    names: [],
    revoked: [],
  };

  function stubDownload() {
    saved.blobs = [];
    saved.names = [];
    saved.revoked = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      saved.blobs.push(blob as Blob);
      return "blob:kerf-test";
    };
    URL.revokeObjectURL = (url: string) => {
      saved.revoked.push(url);
    };
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.names.push(this.download);
    });
  }

  const savedBytes = async (): Promise<Uint8Array> => {
    const blob = saved.blobs[0];
    if (!blob) throw new Error("nothing was downloaded");
    return new Uint8Array(await blob.arrayBuffer());
  };

  afterEach(() => vi.restoreAllMocks());

  const press = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

  it("downloads Bookcase.kerf that opens back to the same project, created when it began", async () => {
    stubDownload();
    const store = setup();
    press();
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(saved.names).toEqual(["Bookcase.kerf"]);
    const bytes = await savedBytes();
    const project = shownProject(store.getState());
    const opened = openKerfBytes(bytes);
    expect(opened.ok && opened.project).toEqual(project);
    const { meta } = readKerf(bytes);
    expect(meta.created).toBe(times.created);
    expect(meta.modified).toBe(NOW.toISOString());
    await waitFor(() => expect(saved.revoked).toEqual(["blob:kerf-test"]));
  });

  it("saves without a picture when the thumbnail source fails", async () => {
    stubDownload();
    const store = setup();
    act(() => store.getState().setThumbnailSource(() => Promise.reject(new Error("no canvas"))));
    press();
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    const { thumbnail } = readKerf(await savedBytes());
    expect(thumbnail).toBeUndefined();
  });

  it("says plainly when the picture is not a PNG, and downloads nothing", async () => {
    stubDownload();
    const store = setup();
    act(() => store.getState().setThumbnailSource(async () => new Uint8Array([1, 2, 3])));
    press();
    await waitFor(() =>
      expect(store.getState().notice?.text).toMatch(/^The file could not be saved: /),
    );
    const text = store.getState().notice?.text ?? "";
    expect(text).not.toContain("$");
    expect(bannedWordsIn(text)).toEqual([]);
    expect(saved.blobs).toHaveLength(0);
  });
});
