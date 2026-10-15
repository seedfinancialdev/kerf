// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": the shown project downloads as a .kerf file that opens back to the same
// project; a picture that cannot be had never stops it, and a failure is said in shop words.

import { KerfFormatError, readKerf } from "@kerf/io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startProject } from "../model/commands";
import { openKerfBytes } from "../model/files";
import { createStorage } from "../model/storage";
import { createKerfStore, shownProject } from "../model/store";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { workshopStore } from "../testing/workshop-store";
import { downloadKeptProject, saveShownProject } from "./save";

const CREATED = "2026-10-12T10:00:00.000Z";
const NOW = new Date("2026-10-13T08:30:00.000Z");

/** A store showing the bookcase, begun at `CREATED`. */
const bookcaseStore = () =>
  workshopStore(startProject("Bookcase", "imperial"), () => Date.parse(CREATED));

const saved: { blobs: Blob[]; names: string[]; revoked: string[] } = {
  blobs: [],
  names: [],
  revoked: [],
};

/** Catches what would be downloaded: the file, its name, and the address given back. */
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

describe("saveShownProject()", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads Bookcase.kerf that opens back to the same project, created when it began", async () => {
    stubDownload();
    const store = await bookcaseStore();
    await saveShownProject(store, NOW);
    expect(saved.names).toEqual(["Bookcase.kerf"]);
    const bytes = await savedBytes();
    const opened = openKerfBytes(bytes);
    expect(opened.ok && opened.project).toEqual(shownProject(store.getState()));
    const { meta } = readKerf(bytes);
    expect(meta.created).toBe(CREATED);
    expect(meta.modified).toBe(NOW.toISOString());
    await vi.waitFor(() => expect(saved.revoked).toEqual(["blob:kerf-test"]));
  });

  it("says there is nothing to save when no project is open", async () => {
    stubDownload();
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
    });
    await saveShownProject(store, NOW);
    expect(saved.blobs).toEqual([]);
    expect(store.getState().notice?.text).toBe("There is no project to save yet.");
  });

  it("saves without a picture when the thumbnail source fails, and logs why", async () => {
    stubDownload();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await bookcaseStore();
    const failure = new Error("no canvas");
    store.getState().setThumbnailSource(() => Promise.reject(failure));
    await saveShownProject(store, NOW);
    expect(readKerf(await savedBytes()).thumbnail).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(failure);
  });

  it("saves without a picture when the picture is not a usable PNG, and logs why", async () => {
    stubDownload();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await bookcaseStore();
    store.getState().setThumbnailSource(async () => new Uint8Array([1, 2, 3]));
    await saveShownProject(store, NOW);
    const opened = readKerf(await savedBytes());
    expect(opened.thumbnail).toBeUndefined();
    expect(opened.project).toEqual(shownProject(store.getState()));
    expect(store.getState().notice).toBeNull();
    expect(logged).toHaveBeenCalledWith(expect.any(KerfFormatError));
  });

  it("saves without a picture when the view takes longer than a second to give one", async () => {
    stubDownload();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await bookcaseStore();
    vi.useFakeTimers();
    store.getState().setThumbnailSource(() => new Promise<Uint8Array>(() => undefined));
    const saving = saveShownProject(store, NOW);
    await vi.advanceTimersByTimeAsync(999);
    expect(saved.blobs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await saving;
    expect(saved.blobs).toHaveLength(1);
    vi.useRealTimers();
    expect(readKerf(await savedBytes()).thumbnail).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.any(Error));
  });

  it("says it is Kerf's fault, in shop words, and logs it when saving fails for no reason in the file", async () => {
    stubDownload();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await bookcaseStore();
    const fault = new TypeError("x is undefined");
    URL.createObjectURL = () => {
      throw fault;
    };
    await saveShownProject(store, NOW);
    const text = store.getState().notice?.text ?? "";
    expect(text).toBe(
      "Kerf hit a problem saving this project, so nothing was saved. Please report it.",
    );
    expect(bannedWordsIn(text)).toEqual([]);
    expect(logged).toHaveBeenCalledWith(fault);
  });
});

describe("downloadKeptProject()", () => {
  afterEach(() => vi.restoreAllMocks());

  /** A library with the bookcase kept at `CREATED`, then the box made and left open an hour later. */
  async function twoKept() {
    let time = Date.parse(CREATED);
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary(),
      clockDate: () => time,
    });
    await store.getState().createProject(startProject("Bookcase", "imperial"), "");
    time += 3_600_000;
    await store.getState().createProject(startProject("Keepsake box", "imperial"), "");
    const [box, bookcase] = store.getState().projects;
    if (!box || !bookcase) throw new Error("both projects should be kept");
    return { store, box, bookcase };
  }

  it("downloads a project that is not open as it is kept, with its own times", async () => {
    stubDownload();
    const { store, bookcase } = await twoKept();
    await downloadKeptProject(store, bookcase.id, NOW);
    expect(saved.names).toEqual(["Bookcase.kerf"]);
    const { project, meta } = readKerf(await savedBytes());
    expect(project).toEqual(startProject("Bookcase", "imperial").project);
    // Not changed by being downloaded: both times are when it was made.
    expect([meta.created, meta.modified]).toEqual([CREATED, CREATED]);
  });

  it("downloads the open project as it is shown, stamped now", async () => {
    stubDownload();
    const { store, box } = await twoKept();
    await downloadKeptProject(store, box.id, NOW);
    expect(saved.names).toEqual(["Keepsake box.kerf"]);
    const { project, meta } = readKerf(await savedBytes());
    expect(project).toEqual(shownProject(store.getState()));
    expect(meta.modified).toBe(NOW.toISOString());
  });

  it("says the project cannot be found, and downloads nothing, when it has gone", async () => {
    stubDownload();
    const { store } = await twoKept();
    await downloadKeptProject(store, "gone", NOW);
    expect(saved.blobs).toEqual([]);
    expect(store.getState().notice?.text).toBe("This project could not be found in this browser.");
  });
});
