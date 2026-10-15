// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D5: the one project older Kerf kept moves into the library once, and is never lost.

import { parseProject, serializeProject } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { startProject } from "./commands";
import { migrateStoredProject } from "./library-migration";
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
    expect(await migrateStoredProject(storage, library, NOW)).toBe("moved");
    const [summary] = await library.list();
    expect(summary).toMatchObject({
      name: storedName,
      created: "2026-10-01T08:00:00.000Z",
      modified: NOW.toISOString(),
      thumbnail: null,
    });
    expect((await library.read(summary?.id as string))?.project).toBe(stored);
    expect(backing.getItem("kerf.project")).toBeNull();
  });

  it("dates a project with no saved creation time from now", async () => {
    const { storage } = withStoredProject();
    const library = memoryLibrary();
    await migrateStoredProject(storage, library, NOW);
    expect((await library.list())[0]?.created).toBe(NOW.toISOString());
  });

  it("does nothing when nothing is stored", async () => {
    const library = memoryLibrary();
    expect(await migrateStoredProject(createStorage(memoryStorage()), library, NOW)).toBe("none");
    expect(await library.list()).toEqual([]);
  });

  it("keeps the stored project where it is when the library cannot keep it", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary({ failWrites: true });
    expect(await migrateStoredProject(storage, library, NOW)).toBe("kept");
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("keeps the stored project when the library is unavailable", async () => {
    const { backing, storage } = withStoredProject();
    const library = memoryLibrary({ available: false });
    expect(await migrateStoredProject(storage, library, NOW)).toBe("kept");
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("moves it once: a second run finds nothing and the library holds one project", async () => {
    const { storage } = withStoredProject();
    const library = memoryLibrary();
    await migrateStoredProject(storage, library, NOW);
    expect(await migrateStoredProject(storage, library, NOW)).toBe("none");
    expect(await library.list()).toHaveLength(1);
  });

  it("never removes a stored project the browser would not let be read", async () => {
    const backing = unreadable(["kerf.project"]);
    backing.setItem("kerf.project", stored);
    const library = memoryLibrary();
    expect(await migrateStoredProject(createStorage(backing), library, NOW)).toBe("kept");
    expect(await library.list()).toEqual([]);
    backing.readable(true);
    expect(backing.getItem("kerf.project")).toBe(stored);
  });

  it("sets a damaged stored project aside and adds nothing to the library", async () => {
    const backing = memoryStorage();
    backing.setItem("kerf.project", "{ not a project");
    const library = memoryLibrary();
    expect(await migrateStoredProject(createStorage(backing), library, NOW)).toBe("none");
    expect(await library.list()).toEqual([]);
    expect(backing.getItem("kerf.project")).toBeNull();
    expect(backing.getItem("kerf.project.setAside")).toBe("{ not a project");
  });
});
