// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D5: every project is kept in the browser's database; nothing fails without a word.

import "fake-indexeddb/auto";
import { serializeProject } from "@kerf/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannedWordsIn } from "../testing/banned-words";
import { startProject } from "./commands";
import {
  browserDatabase,
  LIBRARY_BLOCKED,
  LIBRARY_LOST,
  LIBRARY_NEWER,
  LIBRARY_NOT_KEPT,
  type LibraryEntry,
  openLibrary,
} from "./library";

/** Stands in for a saved project's text; the library keeps it without reading it. */
const PROJECT_TEXT = '{"schemaVersion":1}';

const entry = (id: string, modified: string): LibraryEntry => ({
  id,
  name: `Project ${id}`,
  project: PROJECT_TEXT,
  thumbnail: new Uint8Array([137, 80, 78, 71]),
  created: "2026-10-14T09:00:00.000Z",
  modified,
  note: "",
});

describe("openLibrary()", () => {
  it("keeps what is written and lists it newest change first, without the project text", async () => {
    const library = await openLibrary(new IDBFactory());
    expect(library.available).toBe(true);
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    await library.write(entry("B", "2026-10-14T11:00:00.000Z"));
    const list = (await library.list()) ?? [];
    expect(list.map((p) => p.id)).toEqual(["B", "A"]);
    expect("project" in (list[0] as object)).toBe(false);
    expect((await library.read("A"))?.project).toBe(PROJECT_TEXT);
  });

  it("lists each project with the kind of piece it is, for a card with no picture", async () => {
    const library = await openLibrary(new IDBFactory());
    const box = serializeProject(startProject("Keepsake box", "imperial").project);
    await library.write({ ...entry("A", "2026-10-14T10:00:00.000Z"), project: box });
    await library.write(entry("B", "2026-10-14T11:00:00.000Z"));
    // A is a box; B's text is not a whole project, so it is drawn blank.
    expect((await library.list())?.map((p) => [p.id, p.kind])).toEqual([
      ["B", "blank"],
      ["A", "box"],
    ]);
  });

  it("replaces a project written again under the same id", async () => {
    const library = await openLibrary(new IDBFactory());
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    await library.write({ ...entry("A", "2026-10-14T12:00:00.000Z"), name: "Renamed" });
    const list = await library.list();
    expect(list).toHaveLength(1);
    expect(list?.[0]?.name).toBe("Renamed");
  });

  it("removes a project", async () => {
    const library = await openLibrary(new IDBFactory());
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    expect(await library.remove("A")).toBe(true);
    expect(await library.list()).toEqual([]);
    expect(await library.read("A")).toBeUndefined();
  });

  it("is unavailable, keeps nothing and says so, when the browser has no database", async () => {
    const library = await openLibrary(undefined);
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(LIBRARY_NOT_KEPT);
    expect(await library.write(entry("A", "2026-10-14T10:00:00.000Z"))).toBe(false);
    expect(await library.list()).toBeUndefined();
  });

  it("is unavailable when the browser refuses to open the database", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refusing = {
      open: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as IDBFactory;
    const library = await openLibrary(refusing);
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(LIBRARY_NOT_KEPT);
  });

  it("tells holding nothing apart from holding a row", async () => {
    const library = await openLibrary(new IDBFactory());
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    expect(await library.holds("A")).toBe(true);
    expect(await library.holds("B")).toBe(false);
  });
});

/**
 * A factory whose database hands out `transaction`, to make the browser fail in ways
 * fake-indexeddb will not. The database it opened is `database`, so a test can close it.
 */
function factoryWith(
  transaction: () => unknown,
): IDBFactory & { database: Record<string, unknown> } {
  const database: Record<string, unknown> = { transaction, close: () => undefined };
  return {
    database,
    open: () => {
      const request: Record<string, unknown> = {};
      setTimeout(() => {
        request.result = database;
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    },
  } as unknown as IDBFactory & { database: Record<string, unknown> };
}

/** A transaction that throws `error`, as a closed or broken database does. */
const throwing = (error: unknown) => () => {
  throw error;
};

/** Writes `row` straight into the store, as an older or damaged Kerf could have. */
async function putRaw(factory: IDBFactory, row: object): Promise<void> {
  const opening = factory.open("kerf", 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(row);
  await new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  db.close();
}

describe("openLibrary() when the browser fails", () => {
  // Each failure is logged; the log itself is checked under "logging" below.
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const quiet = () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  };

  it("does not say a write was kept when its transaction aborts after the request succeeded", async () => {
    quiet();
    const aborting = () => {
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({
        put: () => {
          const request: Record<string, unknown> = {};
          setTimeout(() => {
            (request.onsuccess as (() => void) | undefined)?.();
            (tx.onabort as () => void)();
          });
          return request;
        },
        delete: () => {
          const request: Record<string, unknown> = {};
          setTimeout(() => {
            (request.onsuccess as (() => void) | undefined)?.();
            (tx.onabort as () => void)();
          });
          return request;
        },
      });
      return tx;
    };
    const library = await openLibrary(factoryWith(aborting));
    expect(await library.write(entry("A", "2026-10-14T10:00:00.000Z"))).toBe(false);
    expect(await library.remove("A")).toBe(false);
  });

  it("does not keep an entry the database cannot store", async () => {
    quiet();
    const library = await openLibrary(new IDBFactory());
    const unstorable = { ...entry("A", "2026-10-14T10:00:00.000Z"), note: () => 1 };
    expect(await library.write(unstorable as unknown as LibraryEntry)).toBe(false);
    expect(await library.list()).toEqual([]);
  });

  it("says it could not list the projects, rather than listing none, when reading fails", async () => {
    quiet();
    const library = await openLibrary(
      factoryWith(throwing(new DOMException("closed", "InvalidStateError"))),
    );
    expect(await library.list()).toBeUndefined();
  });

  it("cannot tell whether a row is held when reading fails", async () => {
    quiet();
    const library = await openLibrary(
      factoryWith(throwing(new DOMException("closed", "InvalidStateError"))),
    );
    expect(await library.holds("A")).toBeUndefined();
  });

  it("is unavailable when opening fails later, with an error", async () => {
    quiet();
    const failing = {
      open: () => {
        const request: Record<string, unknown> = { error: new DOMException("no", "UnknownError") };
        setTimeout(() => (request.onerror as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    expect((await openLibrary(failing)).available).toBe(false);
  });

  it("is unavailable when opening is blocked, rather than waiting forever, and says to close the other tab", async () => {
    quiet();
    const blocked = {
      open: () => {
        const request: Record<string, unknown> = {};
        setTimeout(() => (request.onblocked as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    const library = await openLibrary(blocked);
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(
      "Kerf is open in another tab, so your projects can't be reached here. Close the other tab, " +
        "then reload this page.",
    );
  });

  it("says to reload when a newer Kerf has upgraded the database", async () => {
    quiet();
    const factory = new IDBFactory();
    const newer = factory.open("kerf", 2);
    await new Promise((resolve) => {
      newer.onsuccess = resolve;
    });
    newer.result.close();
    const library = await openLibrary(factory);
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(
      "A newer Kerf has updated your projects in this browser. Reload the page to use it.",
    );
  });

  it("reads a row with a field it does not know, as a newer Kerf may write, and keeps that field", async () => {
    // Rows come only from Kerf's own database: a field added later is carried, not a reason to
    // hide the project from Home.
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await putRaw(factory, { ...entry("A", "2026-10-14T10:00:00.000Z"), colour: "walnut" });
    expect((await library.list())?.map((p) => p.id)).toEqual(["A"]);
    expect(await library.read("A")).toMatchObject({ id: "A", colour: "walnut" });
  });

  it("holds a damaged row it will not read", async () => {
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await putRaw(factory, { id: "B", name: "damaged" });
    expect(await library.read("B")).toBeUndefined();
    expect(await library.holds("B")).toBe(true);
  });

  it("skips a damaged row when listing, and will not read it", async () => {
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    const { modified: _modified, ...noModified } = entry("B", "x");
    const { project: _project, ...noProject } = entry("C", "2026-10-14T12:00:00.000Z");
    await putRaw(factory, noModified);
    await putRaw(factory, noProject);
    expect((await library.list())?.map((p) => p.id)).toEqual(["A"]);
    expect(await library.read("B")).toBeUndefined();
    expect(await library.read("C")).toBeUndefined();
  });

  it("gives the connection up when another tab upgrades the database, and says to reload", async () => {
    quiet();
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    const upgrading = factory.open("kerf", 2);
    await new Promise((resolve) => {
      upgrading.onsuccess = resolve;
    });
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(
      "Kerf lost hold of your projects (Kerf was updated in another tab, or this site's data was " +
        "cleared). Reload the page to keep working.",
    );
    expect(await library.read("A")).toBeUndefined();
    expect(await library.write(entry("B", "2026-10-14T10:00:00.000Z"))).toBe(false);
    upgrading.result.close();
  });

  it("is no longer available once the browser closes the database, as clearing site data does", async () => {
    const factory = factoryWith(() => ({}));
    const library = await openLibrary(factory);
    expect(library.available).toBe(true);
    (factory.database.onclose as () => void)();
    expect(library.available).toBe(false);
    expect(library.notKept).toBe(
      "Kerf lost hold of your projects (Kerf was updated in another tab, or this site's data was " +
        "cleared). Reload the page to keep working.",
    );
  });

  it("reports a missing project as removed, since it is gone either way", async () => {
    const library = await openLibrary(new IDBFactory());
    expect(await library.remove("nothing")).toBe(true);
  });

  it("finds nothing to read when unavailable", async () => {
    expect(await (await openLibrary(undefined)).read("A")).toBeUndefined();
    expect(await (await openLibrary(undefined)).holds("A")).toBeUndefined();
    expect(await (await openLibrary(undefined)).remove("A")).toBe(false);
  });
});

describe("openLibrary() with a misbehaving browser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets go of a connection that opens after the open was given up as blocked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let closed = false;
    const late = {
      open: () => {
        const request: Record<string, unknown> = {};
        setTimeout(() => {
          (request.onblocked as () => void)();
          request.result = { close: () => (closed = true) };
          (request.onsuccess as () => void)();
        });
        return request;
      },
    } as unknown as IDBFactory;
    expect((await openLibrary(late)).available).toBe(false);
    await new Promise((resolve) => setTimeout(resolve));
    expect(closed).toBe(true);
  });

  it("reports a write false, with nothing left unhandled, when storing throws and the transaction aborts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwingPut = () => {
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({
        put: () => {
          setTimeout(() => (tx.onabort as (() => void) | undefined)?.());
          throw new DOMException("cannot clone", "DataCloneError");
        },
      });
      return tx;
    };
    const library = await openLibrary(factoryWith(throwingPut));
    expect(await library.write(entry("A", "2026-10-14T10:00:00.000Z"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve));
  });
});

describe("openLibrary() logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const readWhenTransactionThrows = async (error: unknown) => {
    const library = await openLibrary(factoryWith(throwing(error)));
    return library.read("A");
  };
  const spies = () => ({
    warned: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    logged: vi.spyOn(console, "error").mockImplementation(() => undefined),
  });

  it("warns of the browser's own failure, even a DOMException made in another realm", async () => {
    const { warned, logged } = spies();
    const foreign = Object.assign(Object.create(null), {
      name: "InvalidStateError",
      [Symbol.toStringTag]: "DOMException",
    });
    expect(await readWhenTransactionThrows(foreign)).toBeUndefined();
    expect(warned).toHaveBeenCalledExactlyOnceWith(foreign);
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs as a fault in Kerf a DOMException the browser raises only for a bad request", async () => {
    const { warned, logged } = spies();
    const unclonable = new DOMException("cannot clone", "DataCloneError");
    expect(await readWhenTransactionThrows(unclonable)).toBeUndefined();
    expect(logged).toHaveBeenCalledExactlyOnceWith(unclonable);
    expect(warned).not.toHaveBeenCalled();
  });

  it("logs a fault in Kerf itself", async () => {
    const { logged } = spies();
    expect(await readWhenTransactionThrows(new TypeError("a bug"))).toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();
  });

  it("warns when the database could not be opened", async () => {
    const { warned } = spies();
    const refused = new DOMException("no", "UnknownError");
    const failing = {
      open: () => {
        const request: Record<string, unknown> = { error: refused };
        setTimeout(() => (request.onerror as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    await openLibrary(failing);
    expect(warned).toHaveBeenCalledExactlyOnceWith(refused);
  });
});

describe("browserDatabase()", () => {
  it("is the page's database", () => {
    expect(browserDatabase()).toBe(globalThis.indexedDB);
  });

  it("is none where reading the page's database throws, as a sandboxed page's does", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get: () => {
        throw new DOMException("The page may not use storage.", "SecurityError");
      },
    });
    try {
      expect(browserDatabase()).toBeUndefined();
    } finally {
      if (own) Object.defineProperty(globalThis, "indexedDB", own);
    }
  });
});

describe("what the library says when it keeps nothing", () => {
  it.each([LIBRARY_NOT_KEPT, LIBRARY_BLOCKED, LIBRARY_NEWER, LIBRARY_LOST])(
    "uses shop language: %s",
    (text) => {
      expect(bannedWordsIn(text)).toEqual([]);
    },
  );
});
