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
// Nothing here throws: a browser that cannot keep projects says so through `available`, `notKept`
// and `write`, and a list that fails says so apart from listing nothing. A write is reported kept
// only once its transaction has committed. Every failure is logged: the browser's own (a full disk,
// a closed connection) as a warning, anything else, a fault in Kerf, as an error.

import type { Id } from "@kerf/core";
import { type PieceKind, pieceKinds } from "./piece-kind";

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

/**
 * What Home shows for a project: everything but the project itself, with the kind of piece it is
 * (read from the project when listed, never kept: ADR 016, "save intent, derive geometry").
 */
export type ProjectSummary = Omit<LibraryEntry, "project"> & { kind: PieceKind };

/** The browser's store of projects. */
export interface Library {
  /**
   * False when the browser has no database, refused or blocked opening it, or has since closed
   * it (another tab upgraded it, or the site's data was cleared).
   */
  readonly available: boolean;
  /** While not `available`: why, and what to do, in shop words. */
  readonly notKept: string;
  /** Every project, newest change first; undefined when they could not be read. */
  list(): Promise<ProjectSummary[] | undefined>;
  /** The project kept under `id`; undefined when there is none or it could not be read. */
  read(id: Id): Promise<LibraryEntry | undefined>;
  /**
   * Whether anything at all is kept under `id`, a damaged row too; undefined when that could not
   * be read, so a caller never writes over what it could not see.
   */
  holds(id: Id): Promise<boolean | undefined>;
  /** True when the entry was kept. */
  write(entry: LibraryEntry): Promise<boolean>;
  /** True when the entry is gone. */
  remove(id: Id): Promise<boolean>;
}

/** Shown on Home while projects cannot be kept (design spec §2, "Keeping projects"). */
export const LIBRARY_NOT_KEPT =
  "This browser isn't keeping your projects. Download a .kerf file to keep your work.";

/** Shown instead when another tab holds the database at an older version, blocking the open. */
export const LIBRARY_BLOCKED =
  "Kerf is open in another tab, so your projects can't be reached here. Close the other tab, " +
  "then reload this page.";

/** Shown instead when a newer Kerf has upgraded the database, which this page cannot open. */
export const LIBRARY_NEWER =
  "A newer Kerf has updated your projects in this browser. Reload the page to use it.";

/** Shown instead when the browser let go of the database while Kerf was open. */
export const LIBRARY_LOST =
  "Kerf lost hold of your projects (Kerf was updated in another tab, or this site's data was " +
  "cleared). Reload the page to keep working.";

const DATABASE = "kerf";
const STORE = "projects";
const VERSION = 1;

/** Whether `value` is a Uint8Array, wherever it was made (one read back from the database may come from another realm). */
const isBytes = (value: unknown): boolean =>
  Object.prototype.toString.call(value) === "[object Uint8Array]";

/**
 * Whether `row` is a whole `LibraryEntry`; a row that is not (damaged, or from elsewhere) is
 * ignored. A field it does not know is allowed and carried: rows come only from Kerf's own
 * database, and one a newer Kerf added must not hide the project (test review, M6).
 */
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

/** The summary of `entry`: every field but the project text, with `kind`, the piece it holds. */
function summaryOf(entry: LibraryEntry, kind: PieceKind): ProjectSummary {
  return {
    id: entry.id,
    name: entry.name,
    thumbnail: entry.thumbnail,
    created: entry.created,
    modified: entry.modified,
    note: entry.note,
    kind,
  };
}

/** Newest change first. */
const newestFirst = (a: ProjectSummary, b: ProjectSummary): number =>
  b.modified.localeCompare(a.modified);

/**
 * Lists `rows` as Home shows them: whole entries only, each with its kind from `kinds` (which
 * reads only what changed), newest change first.
 */
export function summariesOf(
  rows: readonly unknown[],
  kinds: ReturnType<typeof pieceKinds>,
): ProjectSummary[] {
  const entries = rows.filter(isLibraryEntry);
  const kindOf = kinds(entries);
  return entries.map((e) => summaryOf(e, kindOf.get(e.id) ?? "blank")).sort(newestFirst);
}

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

/** The name `openDatabase` gives the error when another tab blocks the open. */
const BLOCKED = "BlockedError";

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
      reject(new DOMException("Another tab is using the database.", BLOCKED));
    };
  });
}

/** Whether `error` is a DOMException; a database from another realm throws its own kind. */
const isDomException = (error: unknown): error is DOMException =>
  error instanceof DOMException ||
  (typeof error === "object" &&
    error !== null &&
    Object.prototype.toString.call(error) === "[object DOMException]");

/**
 * The browser's own failures: a full disk, a cancelled write, a damaged, refused or closed
 * database. Any other error (a value that cannot be stored, a bad key, a missing store) is a fault
 * in Kerf (silent-failure review, M1).
 */
const BROWSER_FAILURES: ReadonlySet<string> = new Set([
  "QuotaExceededError",
  "AbortError",
  "UnknownError",
  "InvalidStateError",
  "VersionError",
  "SecurityError",
  "NotReadableError",
  BLOCKED,
]);

/** Logs `error` for a bug report: a warning when the browser failed, an error when Kerf did. */
function logFailure(error: unknown): void {
  if (isDomException(error) && BROWSER_FAILURES.has(error.name)) console.warn(error);
  else console.error(error);
}

/** Why opening failed with `error`, in shop words. */
function whyNotOpened(error: unknown): string {
  if (isDomException(error) && error.name === BLOCKED) return LIBRARY_BLOCKED;
  if (isDomException(error) && error.name === "VersionError") return LIBRARY_NEWER;
  return LIBRARY_NOT_KEPT;
}

/** A library that keeps nothing, for the reason `notKept`. */
const unavailable = (notKept: string): Library => ({
  available: false,
  notKept,
  list: async () => undefined,
  read: async () => undefined,
  holds: async () => undefined,
  write: async () => false,
  remove: async () => false,
});

/**
 * Opens the library in `factory` (the browser's `indexedDB`). Never rejects: a missing, refusing or
 * blocked database gives a library that is not `available`, keeps nothing, and says why in
 * `notKept`. Rows that are not whole entries are skipped by `list` and not returned by `read`, so
 * one damaged row never blanks Home. `remove` is true for an id that holds nothing: it is gone
 * either way. When another tab upgrades the database, or the browser closes it, the connection is
 * given up: the library is no longer `available`, and every call then fails soft.
 */
export async function openLibrary(factory: IDBFactory | undefined): Promise<Library> {
  if (!factory) return unavailable(LIBRARY_NOT_KEPT);
  let db: IDBDatabase;
  try {
    db = await openDatabase(factory);
  } catch (error) {
    logFailure(error);
    return unavailable(whyNotOpened(error));
  }
  let open = true;
  db.onversionchange = () => {
    open = false;
    db.close();
  };
  db.onclose = () => {
    open = false;
  };
  const attempt = async <T>(work: () => Promise<T>, otherwise: T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      logFailure(error);
      return otherwise;
    }
  };
  const row = (id: Id): Promise<unknown> => done(db.transaction(STORE).objectStore(STORE).get(id));
  const kinds = pieceKinds();
  const change = (work: (store: IDBObjectStore) => void): Promise<boolean> =>
    attempt(async () => {
      const tx = db.transaction(STORE, "readwrite");
      work(tx.objectStore(STORE));
      await committed(tx);
      return true;
    }, false);
  return {
    get available() {
      return open;
    },
    notKept: LIBRARY_LOST,
    list: () =>
      attempt(async () => {
        const rows: unknown[] = await done(db.transaction(STORE).objectStore(STORE).getAll());
        return summariesOf(rows, kinds);
      }, undefined),
    read: (id) =>
      attempt(async () => {
        const found = await row(id);
        return isLibraryEntry(found) ? found : undefined;
      }, undefined),
    holds: (id) => attempt(async () => (await row(id)) !== undefined, undefined),
    write: (entry) => change((store) => store.put(entry)),
    remove: (id) => change((store) => store.delete(id)),
  };
}

/** The page's database, or undefined where reading it throws (a sandboxed page, blocked site data). */
export function browserDatabase(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}
