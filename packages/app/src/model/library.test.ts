// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D5: every project is kept in the browser's database; nothing fails without a word.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { bannedWordsIn } from "../testing/banned-words";
import { browserDatabase, LIBRARY_NOT_KEPT, type LibraryEntry, openLibrary } from "./library";

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
    const list = await library.list();
    expect(list.map((p) => p.id)).toEqual(["B", "A"]);
    expect("project" in (list[0] as object)).toBe(false);
    expect((await library.read("A"))?.project).toBe(PROJECT_TEXT);
  });

  it("replaces a project written again under the same id", async () => {
    const library = await openLibrary(new IDBFactory());
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    await library.write({ ...entry("A", "2026-10-14T12:00:00.000Z"), name: "Renamed" });
    const list = await library.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Renamed");
  });

  it("removes a project", async () => {
    const library = await openLibrary(new IDBFactory());
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    expect(await library.remove("A")).toBe(true);
    expect(await library.list()).toEqual([]);
    expect(await library.read("A")).toBeUndefined();
  });

  it("is unavailable, and keeps nothing, when the browser has no database", async () => {
    const library = await openLibrary(undefined);
    expect(library.available).toBe(false);
    expect(await library.write(entry("A", "2026-10-14T10:00:00.000Z"))).toBe(false);
    expect(await library.list()).toEqual([]);
  });

  it("is unavailable when the browser refuses to open the database", async () => {
    const refusing = {
      open: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as IDBFactory;
    expect((await openLibrary(refusing)).available).toBe(false);
  });
});

/** A factory whose database hands out `transaction`, to make the browser fail in ways fake-indexeddb will not. */
function factoryWith(transaction: () => unknown): IDBFactory {
  return {
    open: () => {
      const request: Record<string, unknown> = {};
      setTimeout(() => {
        request.result = { transaction, close: () => undefined };
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
}

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
  it("does not say a write was kept when its transaction aborts after the request succeeded", async () => {
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
    const library = await openLibrary(new IDBFactory());
    const unstorable = { ...entry("A", "2026-10-14T10:00:00.000Z"), note: () => 1 };
    expect(await library.write(unstorable as unknown as LibraryEntry)).toBe(false);
    expect(await library.list()).toEqual([]);
  });

  it("is unavailable when opening fails later, with an error", async () => {
    const failing = {
      open: () => {
        const request: Record<string, unknown> = { error: new DOMException("no", "UnknownError") };
        setTimeout(() => (request.onerror as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    expect((await openLibrary(failing)).available).toBe(false);
  });

  it("is unavailable when opening is blocked, rather than waiting forever", async () => {
    const blocked = {
      open: () => {
        const request: Record<string, unknown> = {};
        setTimeout(() => (request.onblocked as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    expect((await openLibrary(blocked)).available).toBe(false);
  });

  it("skips a damaged row when listing, and will not read it", async () => {
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    const { modified: _modified, ...noModified } = entry("B", "x");
    const { project: _project, ...noProject } = entry("C", "2026-10-14T12:00:00.000Z");
    await putRaw(factory, noModified);
    await putRaw(factory, noProject);
    expect((await library.list()).map((p) => p.id)).toEqual(["A"]);
    expect(await library.read("B")).toBeUndefined();
    expect(await library.read("C")).toBeUndefined();
  });

  it("keeps working after another tab upgrades the database, by giving the connection up", async () => {
    const factory = new IDBFactory();
    const library = await openLibrary(factory);
    await library.write(entry("A", "2026-10-14T10:00:00.000Z"));
    const upgrading = factory.open("kerf", 2);
    await new Promise((resolve) => {
      upgrading.onsuccess = resolve;
    });
    expect(await library.read("A")).toBeUndefined();
    expect(await library.write(entry("B", "2026-10-14T10:00:00.000Z"))).toBe(false);
    upgrading.result.close();
  });

  it("reports a missing project as removed, since it is gone either way", async () => {
    const library = await openLibrary(new IDBFactory());
    expect(await library.remove("nothing")).toBe(true);
  });

  it("finds nothing to read when unavailable", async () => {
    expect(await (await openLibrary(undefined)).read("A")).toBeUndefined();
    expect(await (await openLibrary(undefined)).remove("A")).toBe(false);
  });
});

describe("openLibrary() with a misbehaving browser", () => {
  it("lets go of a connection that opens after the open was given up as blocked", async () => {
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
    const throwing = () => {
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({
        put: () => {
          setTimeout(() => (tx.onabort as (() => void) | undefined)?.());
          throw new DOMException("cannot clone", "DataCloneError");
        },
      });
      return tx;
    };
    const library = await openLibrary(factoryWith(throwing));
    expect(await library.write(entry("A", "2026-10-14T10:00:00.000Z"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve));
  });
});

describe("openLibrary() logging", () => {
  const readWhenTransactionThrows = async (error: unknown) => {
    const library = await openLibrary(
      factoryWith(() => {
        throw error;
      }),
    );
    return library.read("A");
  };

  it("stays quiet about a DOMException made in another realm", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const foreign = Object.assign(Object.create(null), {
      name: "InvalidStateError",
      [Symbol.toStringTag]: "DOMException",
    });
    expect(await readWhenTransactionThrows(foreign)).toBeUndefined();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs a fault in Kerf itself", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await readWhenTransactionThrows(new TypeError("a bug"))).toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
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

describe("LIBRARY_NOT_KEPT", () => {
  it("uses shop language", () => {
    expect(bannedWordsIn(LIBRARY_NOT_KEPT)).toEqual([]);
  });
});
