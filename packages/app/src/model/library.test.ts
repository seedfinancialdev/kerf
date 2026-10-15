// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D5: every project is kept in the browser's database; nothing fails without a word.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { type LibraryEntry, openLibrary } from "./library";

const entry = (id: string, modified: string): LibraryEntry => ({
  id,
  name: `Project ${id}`,
  project: '{"schemaVersion":1}',
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
    expect((await library.read("A"))?.project).toBe('{"schemaVersion":1}');
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
