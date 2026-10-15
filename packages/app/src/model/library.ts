// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Every project kept in the browser's database (ADR 016, D5): IndexedDB database "kerf", object store
// "projects", keyed by project id. The project is stored as its saved text (intent only) with a picture.
// Nothing here throws: a browser that cannot keep projects says so through `available` and `write`.

import type { Id } from "@kerf/core";

/** One kept project. Times are ISO strings; `note` is the idea typed for "Something else". */
export interface LibraryEntry {
  id: Id;
  name: string;
  /** The project as `serializeProject` writes it. */
  project: string;
  /** A PNG picture of the model, or null when none could be taken. */
  thumbnail: Uint8Array | null;
  created: string;
  modified: string;
  note: string;
}

/** What Home shows for a project: everything but the project itself. */
export type ProjectSummary = Omit<LibraryEntry, "project">;

/** The browser's store of projects. */
export interface Library {
  /** False when the browser has no database or refused to open it. */
  readonly available: boolean;
  /** Every project, newest change first; empty when unavailable or unreadable. */
  list(): Promise<ProjectSummary[]>;
  /** The project kept under `id`; undefined when there is none or it could not be read. */
  read(id: Id): Promise<LibraryEntry | undefined>;
  /** True when the entry was kept. */
  write(entry: LibraryEntry): Promise<boolean>;
  /** True when the entry is gone. */
  remove(id: Id): Promise<boolean>;
}

/** Shown on Home while projects cannot be kept (design spec §2, "Keeping projects"). */
export const LIBRARY_NOT_KEPT =
  "This browser isn't keeping your projects. Download a .kerf file to keep your work.";

const DATABASE = "kerf";
const STORE = "projects";

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const unavailable: Library = {
  available: false,
  list: async () => [],
  read: async () => undefined,
  write: async () => false,
  remove: async () => false,
};

/** The summary of `entry`: every field but the project text. */
export function summaryOf(entry: LibraryEntry): ProjectSummary {
  return {
    id: entry.id,
    name: entry.name,
    thumbnail: entry.thumbnail,
    created: entry.created,
    modified: entry.modified,
    note: entry.note,
  };
}

/** Newest change first. */
export const newestFirst = (a: ProjectSummary, b: ProjectSummary): number =>
  b.modified.localeCompare(a.modified);

/**
 * Opens the library in `factory` (the browser's `indexedDB`). Never rejects: a missing or refusing
 * database gives a library that is not `available` and keeps nothing.
 */
export async function openLibrary(factory: IDBFactory | undefined): Promise<Library> {
  if (!factory) return unavailable;
  let db: IDBDatabase;
  try {
    const opening = factory.open(DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: "id" });
    db = await done(opening);
  } catch {
    return unavailable;
  }
  const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  const attempt = async <T>(work: () => Promise<T>, otherwise: T): Promise<T> => {
    try {
      return await work();
    } catch {
      return otherwise;
    }
  };
  return {
    available: true,
    list: () =>
      attempt(async () => {
        const all = (await done(store("readonly").getAll())) as LibraryEntry[];
        return all.map(summaryOf).sort(newestFirst);
      }, []),
    read: (id) =>
      attempt(
        async () => (await done(store("readonly").get(id))) as LibraryEntry | undefined,
        undefined,
      ),
    write: (entry) =>
      attempt(async () => {
        await done(store("readwrite").put(entry));
        return true;
      }, false),
    remove: (id) =>
      attempt(async () => {
        await done(store("readwrite").delete(id));
        return true;
      }, false),
  };
}
