// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Every project kept in the browser's database (ADR 016, D5).
//
// Schema (version 1): IndexedDB database "kerf", object store "projects", keyPath "id", no index.
// A row is a `LibraryEntry`: the project as its saved text (intent only, never derived data) with a
// picture. `list` sorts in memory, since a library holds tens of projects, not thousands.
// Upgrade policy: a new version only adds stores or indexes, branching on the old version in
// `upgrade`; stored projects are never dropped or rewritten by an upgrade.
//
// Nothing here throws: a browser that cannot keep projects says so through `available` and `write`.
// A write is reported kept only once its transaction has committed.

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
const VERSION = 1;

/** Whether `value` is a Uint8Array, wherever it was made (one read back from the database may come from another realm). */
const isBytes = (value: unknown): boolean =>
  Object.prototype.toString.call(value) === "[object Uint8Array]";

/** Whether `row` is a whole `LibraryEntry`; a row that is not (damaged, or from elsewhere) is ignored. */
export function isLibraryEntry(row: unknown): row is LibraryEntry {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    ["id", "name", "project", "created", "modified", "note"].every(
      (k) => typeof r[k] === "string",
    ) &&
    (r.thumbnail === null || isBytes(r.thumbnail))
  );
}

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

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Resolves when `tx` has committed; rejects if it fails or is aborted, as a full disk does. */
const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException("The write was cancelled.", "AbortError"));
  });

/** Creates what version `oldVersion` lacks. Never removes anything. */
function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1 && !db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: "id" });
  }
}

/**
 * Opens the database; rejects when it cannot be opened or opening is blocked by another tab. A
 * connection that opens after the open was given up is closed, so it cannot block an upgrade.
 */
function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const opening = factory.open(DATABASE, VERSION);
    opening.onupgradeneeded = (event) => upgrade(opening.result, event.oldVersion);
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => db.close();
      if (settled) db.close();
      else resolve(db);
      settled = true;
    };
    opening.onerror = () => {
      settled = true;
      reject(opening.error);
    };
    opening.onblocked = () => {
      settled = true;
      reject(new DOMException("Another tab is using the database.", "InvalidStateError"));
    };
  });
}

/** Whether `error` is a DOMException; a database from another realm throws its own kind. */
const isDomException = (error: unknown): boolean =>
  error instanceof DOMException ||
  (typeof error === "object" &&
    error !== null &&
    Object.prototype.toString.call(error) === "[object DOMException]");

const unavailable: Library = {
  available: false,
  list: async () => [],
  read: async () => undefined,
  write: async () => false,
  remove: async () => false,
};

/**
 * Opens the library in `factory` (the browser's `indexedDB`). Never rejects: a missing, refusing or
 * blocked database gives a library that is not `available` and keeps nothing. Rows that are not
 * whole entries are skipped by `list` and not returned by `read`, so one damaged row never blanks
 * Home. `remove` is true for an id that holds nothing: it is gone either way. When another tab
 * upgrades the database this connection is given up, and every call then fails soft.
 */
export async function openLibrary(factory: IDBFactory | undefined): Promise<Library> {
  if (!factory) return unavailable;
  let db: IDBDatabase;
  try {
    db = await openDatabase(factory);
  } catch {
    return unavailable;
  }
  const attempt = async <T>(work: () => Promise<T>, otherwise: T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (!isDomException(error)) console.error(error);
      return otherwise;
    }
  };
  const change = (work: (store: IDBObjectStore) => void): Promise<boolean> =>
    attempt(async () => {
      const tx = db.transaction(STORE, "readwrite");
      work(tx.objectStore(STORE));
      await committed(tx);
      return true;
    }, false);
  return {
    available: true,
    list: () =>
      attempt(async () => {
        const rows: unknown[] = await done(db.transaction(STORE).objectStore(STORE).getAll());
        return rows.filter(isLibraryEntry).map(summaryOf).sort(newestFirst);
      }, []),
    read: (id) =>
      attempt(async () => {
        const row: unknown = await done(db.transaction(STORE).objectStore(STORE).get(id));
        return isLibraryEntry(row) ? row : undefined;
      }, undefined),
    write: (entry) => change((store) => store.put(entry)),
    remove: (id) => change((store) => store.delete(id)),
  };
}
