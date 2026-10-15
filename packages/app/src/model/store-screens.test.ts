// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "The flow" and §2 "Home": the screens (Your shop, Home, the Workshop), every project
// kept in the library as it changes (ADR 016, D5), and the shop record behind the engine's shop
// (ADR 016, D3).

import { INCH, type Project, parseProject } from "@kerf/core";
import { describe, expect, it, vi } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { setSize, startProject } from "./commands";
import { saveKerfBytes } from "./files";
import { LIBRARY_NOT_KEPT, type Library, type LibraryEntry } from "./library";
import { STARTER_RECORD } from "./shop-record";
import { lengthOf } from "./size";
import { createStorage } from "./storage";
import { createKerfStore, shownProject } from "./store";

/** A clock that moves on a minute each time it is read, so every write has a time of its own. */
const ticking = (): (() => number) => {
  let t = Date.UTC(2026, 9, 14, 9);
  return () => {
    t += 60_000;
    return t;
  };
};

const storeWith = (library: Library = memoryLibrary(), backing: Storage = memoryStorage()) =>
  createKerfStore({ storage: createStorage(backing), library, clockDate: ticking() });

const bookcase = () => startProject("Bookcase", "imperial");

/** A library whose writes can be refused from a point on, as a disk that fills up does. */
const fillingLibrary = (): Library & { fill(): void } => {
  const inner = memoryLibrary();
  let full = false;
  return {
    ...inner,
    write: (entry: LibraryEntry) => (full ? Promise.resolve(false) : inner.write(entry)),
    fill: () => {
      full = true;
    },
  };
};

describe("the screens", () => {
  it("opens on Your shop at first launch and on Home after", () => {
    expect(storeWith().getState().screen).toBe("shop");
    const backing = memoryStorage();
    backing.setItem("kerf.shop", JSON.stringify(STARTER_RECORD));
    expect(storeWith(memoryLibrary(), backing).getState().screen).toBe("home");
  });

  it("goes Home, not to an empty workshop", () => {
    const store = storeWith();
    store.getState().setScreen("workshop");
    expect(store.getState().screen).toBe("home");
  });

  it("keeps the open project when the workshop is left, and drops the pick and a half-done action", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    const shown = shownProject(store.getState());
    store.getState().setTool("tape");
    store.getState().setPending({ tool: "tape", from: [0, 0, 0] });
    store.getState().setScreen("home");
    expect(store.getState().screen).toBe("home");
    expect(store.getState().selection).toEqual({ kind: "none" });
    expect(store.getState().pending).toBeNull();
    store.getState().setScreen("workshop");
    expect(store.getState().screen).toBe("workshop");
    expect(shownProject(store.getState())).toBe(shown);
  });

  it("drops a drag's preview when the workshop is left, and shows the recorded project again", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    const recorded = shownProject(store.getState()) as Project;
    const r = setSize(recorded, recorded.structures[0]?.id as string, "w", '30"');
    if (!r.ok) throw new Error(r.message);
    store.getState().preview(r.edit.project);
    store.getState().setScreen("home");
    expect(store.getState().previewed).toBeNull();
    // Bookcase shelves: 36 − 2 × 23/32 + 2 × 1/4 = 35-1/16" = 7,124,700 (Operation specs).
    const shelf = store
      .getState()
      .solved?.result.cutList.lines.find((l) => l.parts.some((p) => p.name === "Shelf"));
    expect(shelf?.length).toBe(7_124_700);
  });
});

describe("the library", () => {
  it("creates a project, keeps it in the library and opens the workshop on Shape", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    const s = store.getState();
    expect([s.screen, s.step]).toEqual(["workshop", "Shape"]);
    expect((await library.list()).map((p) => p.name)).toEqual(["Bookcase"]);
    expect(s.projects).toHaveLength(1);
    const form = s.history?.entries[0]?.project.structures[0]?.id;
    expect(s.selection).toEqual({ kind: "structure", structure: form });
  });

  it("keeps the idea typed for a new project with every later change", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "for the alcove");
    const id = store.getState().projectId as string;
    const p = shownProject(store.getState()) as Project;
    store.getState().apply({ label: "Renamed", project: { ...p, name: "Alcove" } });
    await vi.waitFor(async () => expect((await library.read(id))?.name).toBe("Alcove"));
    expect((await library.read(id))?.note).toBe("for the alcove");
  });

  it("writes every recorded change to the library under the same project", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    const id = store.getState().projectId as string;
    const structure = store.getState().history?.entries[0]?.project.structures[0]?.id as string;
    const r = setSize(shownProject(store.getState()) as Project, structure, "w", '30"');
    if (!r.ok) throw new Error(r.message);
    store.getState().apply(r.edit);
    // Ruling R4: the stored width evaluates to 30" = 30 × 203200 = 6,096,000.
    await vi.waitFor(async () => {
      const kept = parseProject((await library.read(id))?.project ?? "");
      expect(lengthOf(kept.structures[0]?.size.w ?? "", kept)).toBe(6_096_000);
    });
    expect(await library.list()).toHaveLength(1);
  });

  it("keeps the view's picture with the project", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    const picture = new Uint8Array([137, 80, 78, 71]);
    store.getState().setThumbnailSource(async () => picture);
    await store.getState().createProject(bookcase(), "");
    const id = store.getState().projectId as string;
    // Compared as numbers: the library hands back a copy, as the browser's database does.
    expect([...((await library.read(id))?.thumbnail ?? [])]).toEqual([137, 80, 78, 71]);
  });

  it("says once that projects are not kept when the library refuses a write", async () => {
    const store = storeWith(memoryLibrary({ failWrites: true }));
    await store.getState().createProject(bookcase(), "");
    expect(store.getState().notice?.text).toBe(LIBRARY_NOT_KEPT);
    store.getState().dismissNotice();
    await store.getState().createProject(bookcase(), "");
    expect(store.getState().notice).toBeNull();
  });

  it("opens a kept project in the workshop with a History of its own", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    const first = store.getState().projectId as string;
    const created = store.getState().created;
    await store.getState().createProject(startProject("Blank box", "imperial"), "");
    store.getState().setScreen("home");
    expect(await store.getState().openProject(first)).toBe(true);
    const s = store.getState();
    expect([s.screen, s.step, s.projectId, s.created]).toEqual([
      "workshop",
      "Shape",
      first,
      created,
    ]);
    expect(s.history?.entries.map((e) => e.label)).toEqual(["Opened Bookcase"]);
  });

  it("goes back to the project already open without losing its History", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    const p = shownProject(store.getState()) as Project;
    store.getState().apply({ label: "Renamed", project: { ...p, name: "Alcove" } });
    store.getState().setScreen("home");
    expect(await store.getState().openProject(store.getState().projectId as string)).toBe(true);
    expect(store.getState().screen).toBe("workshop");
    expect(store.getState().history?.entries).toHaveLength(2);
  });

  it("refuses to open a damaged project, says so and stays on Home", async () => {
    const library = memoryLibrary();
    await library.write({
      id: "01K7M4AP000000000000000000",
      name: "Broken",
      project: "{ not a project",
      thumbnail: null,
      created: "2026-10-14T09:00:00.000Z",
      modified: "2026-10-14T09:00:00.000Z",
      note: "",
    });
    const store = storeWith(library);
    store.getState().setScreen("home");
    expect(await store.getState().openProject("01K7M4AP000000000000000000")).toBe(false);
    expect(store.getState().notice?.text).toBe("This project could not be opened: it is damaged.");
    expect(store.getState().screen).toBe("home");
  });

  it("deletes a project with an Undo that brings it back", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    const id = store.getState().projectId as string;
    store.getState().setScreen("home");
    await store.getState().deleteProject(id);
    expect(store.getState().projects).toEqual([]);
    expect(store.getState().notice?.text).toBe('Deleted "Bookcase".');
    await store.getState().notice?.undo?.();
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Bookcase"]);
    expect(store.getState().notice).toBeNull();
  });

  it("closes a deleted project that was open, so no later change writes it back", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    await store.getState().deleteProject(store.getState().projectId as string);
    expect([store.getState().history, store.getState().projectId]).toEqual([null, null]);
    expect(store.getState().screen).toBe("home");
  });

  it("says so when a deleted project cannot be put back", async () => {
    const library = fillingLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    await store.getState().deleteProject(store.getState().projectId as string);
    library.fill();
    await store.getState().notice?.undo?.();
    expect(store.getState().notice?.text).toBe('"Bookcase" could not be put back in this browser.');
    expect(store.getState().projects).toEqual([]);
  });

  it("says so when the library will not delete a project, and keeps it", async () => {
    const store = storeWith(memoryLibrary({ failRemoves: true }));
    await store.getState().createProject(bookcase(), "");
    await store.getState().deleteProject(store.getState().projectId as string);
    expect(store.getState().notice?.text).toBe(
      '"Bookcase" could not be deleted from this browser.',
    );
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Bookcase"]);
  });

  it("duplicates a project as '<name> copy', newest first", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    await store.getState().duplicateProject(store.getState().projectId as string);
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Bookcase copy", "Bookcase"]);
  });

  it("names the copy inside the project too, so opening it keeps the new name", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    await store.getState().duplicateProject(store.getState().projectId as string);
    const copy = store.getState().projects[0]?.id as string;
    await store.getState().openProject(copy);
    expect(shownProject(store.getState())?.name).toBe("Bookcase copy");
  });

  it("renames a project, refusing an empty name", async () => {
    const store = storeWith();
    await store.getState().createProject(bookcase(), "");
    const id = store.getState().projectId as string;
    await store.getState().renameProject(id, "   ");
    expect(store.getState().notice?.text).toBe("Give the project a name.");
    await store.getState().renameProject(id, "Alcove bookcase");
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Alcove bookcase"]);
    expect(shownProject(store.getState())?.name).toBe("Alcove bookcase");
  });

  it("renames a project that is not open, inside the project too", async () => {
    const library = memoryLibrary();
    const store = storeWith(library);
    await store.getState().createProject(bookcase(), "");
    const id = store.getState().projectId as string;
    await store.getState().createProject(startProject("Blank box", "imperial"), "");
    await store.getState().renameProject(id, "Alcove bookcase");
    expect(parseProject((await library.read(id))?.project ?? "").name).toBe("Alcove bookcase");
    expect(store.getState().projects.map((p) => p.name)).toEqual(["Alcove bookcase", "Blank box"]);
  });

  it("adds an opened file as a new project and never replaces one", async () => {
    const store = storeWith();
    const bytes = saveKerfBytes(startProject("Keepsake box", "imperial").project, {
      created: "2026-10-14T09:00:00.000Z",
      modified: "2026-10-14T09:00:00.000Z",
    });
    await store.getState().addFile(bytes, "Box.kerf");
    await store.getState().addFile(bytes, "Box.kerf");
    expect(store.getState().projects).toHaveLength(2);
    expect(store.getState().screen).toBe("workshop");
    expect(store.getState().history?.entries.map((e) => e.label)).toEqual(["Opened Box.kerf"]);
  });

  it("says why a file could not be added, and adds nothing", async () => {
    const store = storeWith();
    store.getState().setScreen("home");
    await store.getState().addFile(new Uint8Array([1, 2, 3]), "broken.kerf");
    expect(store.getState().notice?.text).toBe(
      "This file could not be opened: it is not a Kerf file, or it is damaged.",
    );
    expect([store.getState().projects, store.getState().screen]).toEqual([[], "home"]);
  });
});

describe("start-up after the old project moved", () => {
  it("says what was wrong with the old project, then that projects are not kept", () => {
    const store = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary({ failWrites: true }),
      migration: { outcome: "none", problem: "Your last project could not be opened." },
    });
    expect(store.getState().notice?.text).toBe("Your last project could not be opened.");
    store.getState().dismissNotice();
    expect(store.getState().notice).toBeNull();
    const kept = createKerfStore({
      storage: createStorage(memoryStorage()),
      library: memoryLibrary({ failWrites: true }),
      migration: { outcome: "kept" },
    });
    expect(kept.getState().notice?.text).toBe(LIBRARY_NOT_KEPT);
  });
});

describe("the shop record", () => {
  it("derives the engine's shop from the record and keeps the record", () => {
    const backing = memoryStorage();
    const store = storeWith(memoryLibrary(), backing);
    const record = { ...STARTER_RECORD, setUp: true, tableSaw: { kerf: (3 * INCH) / 32 } };
    store.getState().setShopRecord(record);
    expect(store.getState().shopRecord).toEqual(record);
    expect(store.getState().shop.kerf).toBe(19_050); // 3/32" = 3 × 203200 / 32
    expect(JSON.parse(backing.getItem("kerf.shop") as string).tableSaw.kerf).toBe(19_050);
  });
});

describe("the tour", () => {
  it("is not finished at first, and stays finished for a later visit", () => {
    const backing = memoryStorage();
    const store = storeWith(memoryLibrary(), backing);
    expect(store.getState().toured).toBe(false);
    store.getState().finishTour();
    expect(store.getState().toured).toBe(true);
    expect(storeWith(memoryLibrary(), backing).getState().toured).toBe(true);
  });
});
