// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D5: the one project older Kerf kept moves into the library once, and is never lost.

import { parseProject, serializeProject } from "@kerf/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { startProject } from "./commands";
import { currentProject } from "./history";
import { type Library, type LibraryEntry, openLibrary } from "./library";
import { MIGRATED_PROJECT_ID, migrateStoredProject } from "./library-migration";
import { createStorage } from "./storage";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const stored = serializeProject(startProject("Bookcase", "imperial").project);
const storedName = parseProject(stored).name;

const withStoredProject = (extra: Record<string, string> = {}) => {
  const backing = memoryStorage();
  backing.setItem("kerf.project", stored);
  for (const [key, value] of Object.entries(extra)) backing.setItem(key, value);
  return { backing, storage: createStorage(backing) };
};

describe("migrateStoredProject()", () => {
  it("moves the stored project into the library, named as the project, created when first saved", async () => {
    const { backing, storage } = withStoredProject({ "kerf.created": "2026-10-01T08:00:00.000Z" });
    const library = memoryLibrary();
    expect(await migrateStoredProject(storage, library, NOW)).toEqual({ outcome: "moved" });
    const [summary] = (await library.list()) ?? [];
    expect(summary).toMatchObject({
      name: storedName,
      created: "2026-10-01T08:00:00.000Z",
      modified: NOW.toISOString(),
      thumbnail: null,
    });
    expect(summary?.id).toBe(MIGRATED_PROJECT_ID);
    expect((await library.read(MIGRATED_PROJECT_ID))?.project).toBe(stored);
    expect(backing.getItem("kerf.project")).toBeNull();
  });

  it("dates a project with no saved creation time from now", async () => {
    const { storage } = withStoredProject();
    const library = memoryLibrary();
    await migrateStoredProject(storage, library, NOW);
    expect((await library.list())?.[0]?.created).toBe(NOW.toISOString());
  });

  it("does nothing when nothing is stored", async () => {
    const library = memoryLibrary();
    expect(await migrateStoredProject(createStorage(memoryStorage()), library, NOW)).toMatchObject({
      outcome: "none",
    });
    expect(await library.list()).toEqual([]);
  });

  it("keeps the stored project where it is when the library cannot keep it", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary({ failWrites: true });
    expect(await migrateStoredProject(storage, library, NOW)).toMatchObject({ outcome: "refused" });
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("keeps the stored project when the library is unavailable", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary({ available: false });
    expect(await migrateStoredProject(storage, library, NOW)).toMatchObject({ outcome: "refused" });
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("hands back the refused project, so it can still be opened this visit", async () => {
    const { storage } = withStoredProject();
    const result = await migrateStoredProject(storage, memoryLibrary({ available: false }), NOW);
    if (result.outcome !== "refused") throw new Error(`expected refused, got ${result.outcome}`);
    expect(serializeProject(currentProject(result.history))).toBe(stored);
  });

  it("writes nothing when it cannot tell whether the library already has the project", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary({ failReads: true });
    const write = vi.spyOn(library, "write");
    expect((await migrateStoredProject(storage, library, NOW)).outcome).toBe("refused");
    expect(write).not.toHaveBeenCalled();
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("moves it once: a second run finds nothing and the library holds one project", async () => {
    const { storage } = withStoredProject();
    const library = memoryLibrary();
    await migrateStoredProject(storage, library, NOW);
    expect(await migrateStoredProject(storage, library, NOW)).toEqual({ outcome: "none" });
    expect(await library.list()).toHaveLength(1);
  });

  it("never removes a stored project the browser would not let be read", async () => {
    const backing = unreadable(["kerf.project"]);
    backing.setItem("kerf.project", stored);
    const library = memoryLibrary();
    expect(await migrateStoredProject(createStorage(backing), library, NOW)).toMatchObject({
      outcome: "unreadable",
    });
    expect(await library.list()).toEqual([]);
    backing.readable(true);
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("sets a damaged stored project aside and adds nothing to the library", async () => {
    const backing = memoryStorage();
    backing.setItem("kerf.project", "{ not a project");
    const library = memoryLibrary();
    const result = await migrateStoredProject(createStorage(backing), library, NOW);
    expect(result).toMatchObject({ outcome: "none", problem: expect.stringMatching(/set aside/) });
    expect(await library.list()).toEqual([]);
    expect(backing.getItem("kerf.project")).toBeNull();
    expect(backing.getItem("kerf.project.setAside")).toBe("{ not a project");
  });

  it("says why a stored project the browser would not let be read stays where it is", async () => {
    const backing = unreadable(["kerf.project"]);
    backing.setItem("kerf.project", stored);
    const result = await migrateStoredProject(createStorage(backing), memoryLibrary(), NOW);
    expect(result).toMatchObject({ problem: expect.stringMatching(/could not be read/) });
  });

  it("leaves work done since untouched when it moves again because storage would not let go", async () => {
    const backing = memoryStorage();
    backing.setItem("kerf.project", stored);
    const holding: Storage = {
      ...backing,
      removeItem: () => undefined,
      getItem: (k) => backing.getItem(k),
    };
    const library = memoryLibrary();
    await migrateStoredProject(createStorage(holding), library, NOW);
    const edited = {
      ...(await library.read(MIGRATED_PROJECT_ID)),
      name: "Edited",
      modified: "2026-10-15T07:00:00.000Z",
    };
    await library.write(edited as LibraryEntry);
    const later = new Date("2026-10-15T08:00:00.000Z");
    expect((await migrateStoredProject(createStorage(holding), library, later)).outcome).toBe(
      "moved",
    );
    expect(await library.list()).toHaveLength(1);
    expect(await library.read(MIGRATED_PROJECT_ID)).toEqual(edited);
  });

  it("removes the stored project once the library already has it", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary();
    await migrateStoredProject(storage, library, NOW);
    backing.setItem("kerf.project", stored);
    expect((await migrateStoredProject(storage, library, NOW)).outcome).toBe("moved");
    expect(backing.getItem("kerf.project")).toBeNull();
  });

  it("moves the project into the real library", async () => {
    const { backing, storage } = withStoredProject();
    const library = await openLibrary(new IDBFactory());
    expect((await migrateStoredProject(storage, library, NOW)).outcome).toBe("moved");
    expect((await library.read(MIGRATED_PROJECT_ID))?.name).toBe(storedName);
    expect(backing.getItem("kerf.project")).toBeNull();
  });

  it("keeps the stored project when the library (a fake with a failing write) refuses it", async () => {
    const { backing, storage } = withStoredProject();
    const refusing = { ...memoryLibrary(), write: async () => false };
    expect((await migrateStoredProject(storage, refusing, NOW)).outcome).toBe("refused");
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("repairs a damaged row at the fixed id by writing the project over it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    const opening = factory.open("kerf", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      opening.onsuccess = () => resolve(opening.result);
    });
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put({ id: MIGRATED_PROJECT_ID, name: "damaged" });
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    db.close();
    const { backing, storage } = withStoredProject();
    expect((await migrateStoredProject(storage, library, NOW)).outcome).toBe("moved");
    expect((await library.read(MIGRATED_PROJECT_ID))?.project).toBe(stored);
    expect(backing.getItem("kerf.project")).toBeNull();
  });
});

/**
 * A library holding the migrated project, edited since as `edited`, as a reload after the
 * move finds it.
 */
async function movedAndEdited(edited: string): Promise<Library> {
  const library = memoryLibrary();
  await library.write({
    id: MIGRATED_PROJECT_ID,
    name: storedName,
    project: edited,
    thumbnail: null,
    created: NOW.toISOString(),
    modified: NOW.toISOString(),
    note: "",
  });
  return library;
}

describe("migrateStoredProject() after an older Kerf tab saved again", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  // The library has the move; an M4 tab left open wrote its own later change to storage.
  const fromOlderTab = serializeProject(startProject("Keepsake box", "imperial").project);
  const olderTabName = `${parseProject(fromOlderTab).name} (older tab)`;

  it("keeps the older tab's change as a project of its own, and leaves the moved one as it was", async () => {
    const library = await movedAndEdited(stored);
    const { backing, storage } = withStoredProject();
    backing.setItem("kerf.project", fromOlderTab);
    const result = await migrateStoredProject(storage, library, NOW);
    expect(result).toEqual({
      outcome: "moved",
      problem: `Changes made in an older Kerf tab were kept as a project of their own, "${olderTabName}".`,
    });
    const names = (await library.list())?.map((p) => p.name);
    expect(names?.sort()).toEqual([olderTabName, storedName].sort());
    expect((await library.read(MIGRATED_PROJECT_ID))?.project).toBe(stored);
    expect(backing.getItem("kerf.project")).toBeNull();
  });

  it("keeps the older tab's change once, though storage will not let it go", async () => {
    const library = await movedAndEdited(stored);
    const backing = memoryStorage();
    backing.setItem("kerf.project", fromOlderTab);
    const holding: Storage = {
      ...backing,
      removeItem: () => undefined,
      getItem: (k) => backing.getItem(k),
    };
    await migrateStoredProject(createStorage(holding), library, NOW);
    expect(await migrateStoredProject(createStorage(holding), library, NOW)).toEqual({
      outcome: "moved",
    });
    expect(await library.list()).toHaveLength(2);
  });

  it("leaves the older tab's change in storage, and hands it back, when the library will not take the copy", async () => {
    const library = await movedAndEdited(stored);
    vi.spyOn(library, "write").mockResolvedValue(false);
    const { backing, storage } = withStoredProject();
    backing.setItem("kerf.project", fromOlderTab);
    const result = await migrateStoredProject(storage, library, NOW);
    expect(result.outcome).toBe("refused");
    expect(backing.getItem("kerf.project")).toBe(fromOlderTab);
  });
});
