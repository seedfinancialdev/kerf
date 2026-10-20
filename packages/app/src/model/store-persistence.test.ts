// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Keeping projects": the open project is kept in the library after every change,
// and the shop and preferences in browser storage; ADR 015, rule 11 for what happens when that
// cannot work.

import { type Project, type Stock, serializeProject } from "@kerf/core";
import { describe, expect, it, vi } from "vitest";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { type Edit, setSize, startProject } from "./commands";
import { startHistory } from "./history";
import { LIBRARY_NOT_KEPT, type Library, type LibraryEntry } from "./library";
import { LAST_PROJECT_NOT_KEPT, type MigrationResult } from "./library-migration";
import { STARTER_RECORD } from "./shop-record";
import { STARTER_SHOP } from "./starter";
import { type AppStorage, createStorage } from "./storage";
import { createKerfStore, shownProject } from "./store";

const renamed = (p: Project): Edit => ({ project: { ...p, name: "Renamed" }, label: "Rename" });
const memory = (): AppStorage => createStorage(memoryStorage());
const full = (): AppStorage => createStorage(memoryStorage(true));
const bookcase = () => startProject("Bookcase", "imperial");
/** The migration's answer when the library would not take the old project, a bookcase. */
const refused = (): MigrationResult => ({ outcome: "refused", history: startHistory(bookcase()) });

/** A store over `library` with one project created in it, and that project's id. */
async function withProject(library: Library = memoryLibrary(), edit: Edit = bookcase()) {
  const store = createKerfStore({ storage: memory(), library });
  await store.getState().createProject(edit, "");
  return { store, id: store.getState().projectId as string };
}

/** A library whose writes can be refused from a point on, as a disk that fills up does. */
const fillingLibrary = (): Library & { fill(): void } => {
  const inner = memoryLibrary();
  let refusing = false;
  return {
    ...inner,
    write: (entry: LibraryEntry) => (refusing ? Promise.resolve(false) : inner.write(entry)),
    fill: () => {
      refusing = true;
    },
  };
};

describe("the open project in the library", () => {
  it("is written exactly as the engine saves it", async () => {
    const library = memoryLibrary();
    const { store, id } = await withProject(library);
    const p = shownProject(store.getState()) as Project;
    expect((await library.read(id))?.project).toBe(serializeProject(p));
  });

  it("is written as the shown entry after an undo", async () => {
    const library = memoryLibrary();
    const { store, id } = await withProject(library);
    const first = shownProject(store.getState()) as Project;
    store.getState().apply(renamed(first));
    store.getState().undo();
    await vi.waitFor(async () =>
      expect((await library.read(id))?.project).toBe(serializeProject(first)),
    );
  });

  it("is not written while a drag is only previewed", async () => {
    const library = memoryLibrary();
    const { store, id } = await withProject(library);
    const before = await library.read(id);
    store.getState().preview(renamed(shownProject(store.getState()) as Project).project);
    await store.getState().refreshProjects();
    expect(await library.read(id)).toEqual(before);
  });

  it("keeps working and warns once when the library will not take a change", async () => {
    const { store } = await withProject(memoryLibrary({ failWrites: true }));
    expect(store.getState().notice).toEqual({ text: LIBRARY_NOT_KEPT, kind: "warning" });
    store.getState().dismissNotice();
    const p = shownProject(store.getState()) as Project;
    const resized = setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!resized.ok) throw new Error(resized.message);
    store.getState().apply(resized.edit);
    await store.getState().refreshProjects();
    expect(store.getState().notice).toBeNull();
    expect(store.getState().solved?.result.cutList.lines).toHaveLength(3);
    expect(store.getState().history?.entries).toHaveLength(2);
  });

  it("keeps an Undo offer on screen and shows the not-kept warning after it", async () => {
    const library = fillingLibrary();
    const { store } = await withProject(library);
    library.fill();
    const offer = "Shelf 2 now overlaps Back; Undo puts it back.";
    store.getState().apply(renamed(shownProject(store.getState()) as Project), offer);
    await store.getState().refreshProjects();
    expect(store.getState().notice).toEqual({ text: offer, kind: "undo" });
    store.getState().dismissNotice();
    expect(store.getState().notice).toEqual({ text: LIBRARY_NOT_KEPT, kind: "warning" });
  });

  it("keeps its time when it is only opened, so Home does not call it edited", async () => {
    const library = memoryLibrary();
    const { store, id } = await withProject(library);
    const before = (await library.read(id))?.modified;
    await store.getState().createProject(startProject("Blank box", "imperial"), "");
    await store.getState().openProject(id);
    await store.getState().refreshProjects();
    expect((await library.read(id))?.modified).toBe(before);
  });
});

describe("units for new projects", () => {
  it("are the ones last chosen, even in a later session", () => {
    const storage = memory();
    createKerfStore({ storage, library: memoryLibrary() }).getState().setUnitsForNew("metric");
    expect(createKerfStore({ storage, library: memoryLibrary() }).getState().unitsForNew).toBe(
      "metric",
    );
  });

  it("are left alone when a metric project is opened", async () => {
    const { store } = await withProject(memoryLibrary(), startProject("Bookcase", "metric"));
    expect(shownProject(store.getState())?.units).toBe("metric");
    expect(store.getState().unitsForNew).toBe("imperial");
  });

  it("stay as chosen when an open project stays in the other ones", () => {
    const s = createKerfStore({ storage: memory(), library: memoryLibrary() });
    s.getState().apply(bookcase());
    s.getState().setUnitsForNew("metric");
    s.getState().apply(bookcase());
    expect(s.getState().unitsForNew).toBe("metric");
  });

  it("apply until the page closes when the browser cannot keep them, which is said once", () => {
    const s = createKerfStore({ storage: full(), library: memoryLibrary() });
    s.getState().dismissNotice();
    s.getState().setUnitsForNew("metric");
    const told =
      "Your choice of units couldn't be kept in this browser; it applies until you close the page.";
    expect(s.getState().notice).toEqual({ text: told, kind: "warning" });
    s.getState().dismissNotice();
    s.getState().setUnitsForNew("imperial");
    s.getState().setUnitsForNew("metric");
    expect(s.getState().notice).toBeNull();
    expect(s.getState().unitsForNew).toBe("metric");
    s.getState().apply(startProject("Bookcase", s.getState().unitsForNew));
    expect(shownProject(s.getState())?.units).toBe("metric");
  });
});

describe("the last New project choice", () => {
  it("is the one last created, even in a later session, its units the units for new projects", () => {
    const storage = memory();
    const first = createKerfStore({ storage, library: memoryLibrary() });
    first.getState().rememberChoice({ piece: "box", units: "metric", wood: "w1" });
    const later = createKerfStore({ storage, library: memoryLibrary() }).getState();
    expect(later.lastChoice).toEqual({ piece: "box", wood: "w1" });
    expect(later.unitsForNew).toBe("metric");
  });

  it("is nothing on a browser that never made one", () => {
    expect(
      createKerfStore({ storage: memory(), library: memoryLibrary() }).getState().lastChoice,
    ).toEqual({});
  });
});

describe("when a project began", () => {
  it("is noted when it is created, and kept with it in the library", async () => {
    const library = memoryLibrary();
    const s = createKerfStore({
      storage: memory(),
      library,
      clockDate: () => Date.UTC(2026, 9, 12),
    });
    await s.getState().createProject(bookcase(), "");
    expect(s.getState().created).toBe("2026-10-12T00:00:00.000Z");
    const id = s.getState().projectId as string;
    expect((await library.read(id))?.created).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("warnings that must not be lost (ADR 015, rule 11: the app says so once)", () => {
  const SET_ASIDE = "Your last project could not be opened. It was set aside in this browser.";

  it("says once that the shop and settings will not survive a reload when the browser has no storage", () => {
    // The projects live in the library, which this browser still has: they are kept.
    const s = createKerfStore({ storage: createStorage(undefined), library: memoryLibrary() });
    expect(s.getState().notice?.text).toBe(
      "This browser won't keep your shop, units or theme between visits; they apply until you " +
        "close the page.",
    );
  });

  it("shows the not-kept warning after a plain notice that was showing is dismissed", async () => {
    const s = createKerfStore({ storage: memory(), library: memoryLibrary({ failWrites: true }) });
    s.getState().say("Something else");
    await s.getState().createProject(bookcase(), "");
    expect(s.getState().notice?.text).toBe("Something else");
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: LIBRARY_NOT_KEPT, kind: "warning" });
  });

  it("keeps the old project's warning when the 3D view's warning arrives, and shows that one next", () => {
    const s = createKerfStore({
      storage: memory(),
      library: memoryLibrary(),
      migration: { outcome: "none", problem: SET_ASIDE },
    });
    const view = "The 3D view could not start (no WebGL), so boards are shown as plain blanks.";
    s.getState().warn(view);
    expect(s.getState().notice?.text).toBe(SET_ASIDE);
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: view, kind: "warning" });
  });

  it("shows every start-up warning in turn: the shop's, then the old project's", () => {
    const storage = memory();
    storage.write("kerf.shop", "not json");
    const s = createKerfStore({
      storage,
      library: memoryLibrary(),
      migration: { outcome: "none", problem: SET_ASIDE },
    });
    expect(s.getState().notice?.text).toMatch(/^Your saved shop could not be used/);
    s.getState().dismissNotice();
    expect(s.getState().notice?.text).toBe(SET_ASIDE);
  });

  it("opens the old project the library refused, not kept, and says where it is", () => {
    const s = createKerfStore({
      storage: memory(),
      library: memoryLibrary({ failWrites: true }),
      migration: refused(),
    });
    expect(s.getState().notice).toEqual({ text: LAST_PROJECT_NOT_KEPT, kind: "warning" });
    expect(shownProject(s.getState())?.name).toBe("Bookcase");
    expect(s.getState().projectId).toBeNull();
  });

  it("says once, beside Home's banner, that the old project is not kept when the browser has no library", () => {
    const s = createKerfStore({
      storage: memory(),
      library: memoryLibrary({ available: false }),
      migration: refused(),
    });
    expect(s.getState().projectsNotKept).toBe(LIBRARY_NOT_KEPT);
    expect(s.getState().notice?.text).toBe(LAST_PROJECT_NOT_KEPT);
    s.getState().dismissNotice();
    expect(s.getState().notice).toBeNull();
  });

  it("never writes the old project it opened for the visit, though it changes", async () => {
    const library = memoryLibrary();
    const s = createKerfStore({ storage: memory(), library, migration: refused() });
    s.getState().apply(renamed(shownProject(s.getState()) as Project));
    await s.getState().refreshProjects();
    expect(await library.list()).toEqual([]);
  });

  it("does not say again that projects are not kept after start-up said so", async () => {
    const s = createKerfStore({
      storage: memory(),
      library: memoryLibrary({ failWrites: true }),
      migration: refused(),
    });
    s.getState().dismissNotice();
    await s.getState().createProject(bookcase(), "");
    expect(s.getState().notice).toBeNull();
  });

  it("says only why when the old project stayed because the browser would not let it be read", () => {
    const unreadableOld = "Your last project could not be read from this browser.";
    const s = createKerfStore({
      storage: memory(),
      library: memoryLibrary(),
      migration: { outcome: "unreadable", problem: unreadableOld },
    });
    expect(s.getState().notice?.text).toBe(unreadableOld);
    s.getState().dismissNotice();
    expect(s.getState().notice).toBeNull();
  });

  it("shows an answer at once over a warning, and the warning again once it is dismissed", () => {
    const s = createKerfStore({ storage: createStorage(undefined), library: memoryLibrary() });
    const nothingKept = s.getState().notice?.text;
    s.getState().say("A distance of zero changes nothing.");
    expect(s.getState().notice?.text).toBe("A distance of zero changes nothing.");
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: nothingKept, kind: "warning" });
  });
});

describe("a shop change the browser cannot keep", () => {
  it("is used until the page closes, and the user is told once", () => {
    const s = createKerfStore({ storage: full(), library: memoryLibrary() });
    // Blade kerf 1/16" = 203200 / 16 = 12700.
    const record = { ...STARTER_RECORD, setUp: true, tableSaw: { kerf: 12_700 } };
    s.getState().setShopRecord(record);
    expect(s.getState().shop.kerf).toBe(12_700);
    expect(s.getState().notice).toEqual({
      text: "Your shop couldn't be kept in this browser; it applies until you close the page.",
      kind: "warning",
    });
    s.getState().dismissNotice();
    s.getState().setShopRecord({ ...record, tableSaw: { kerf: 25_400 } });
    expect(s.getState().notice).toBeNull();
  });
});

describe("a shop change", () => {
  it("saves the wood on the pegboard with the tools", () => {
    const storage = memory();
    const oak: Stock = {
      id: "01K7M4AP0000000000000000OK",
      name: "Oak",
      kind: "solid",
      thickness: 101_600, // 1/2" = 203200 / 2
      solid: { standardLengths: [19_507_200], maxWidth: 1_625_600 },
      allowance: { length: 0, width: 0 },
    };
    const s = createKerfStore({ storage, library: memoryLibrary() });
    s.getState().setShopRecord({ ...STARTER_RECORD, setUp: true, stock: [oak] });
    expect(JSON.parse(storage.read("kerf.shop") ?? "null").stock).toEqual([oak]);
  });
});

describe("section open state that storage holds damaged", () => {
  // persist.ts, readSections: a damaged value only loses which sections were open, so the app
  // starts with none remembered, and keeps any entry that is still a yes or no.
  it.each([
    ["text that is not JSON", "{", {}],
    ["null", "null", {}],
    ["a number", "7", {}],
    [
      "an entry that is not a yes or no",
      '{"Your shop": false, "Files": "yes"}',
      { "Your shop": false },
    ],
  ])("starts with %s read as what it can keep", (_, stored, sections) => {
    const storage = memory();
    storage.write("kerf.sections", stored);
    expect(createKerfStore({ storage, library: memoryLibrary() }).getState().sections).toEqual(
      sections,
    );
  });
});

describe("a saved shop that could not be used or set aside at start", () => {
  it("is never written over by a later change, which is said not to be kept", () => {
    const backing = memoryStorage();
    backing.setItem("kerf.shop", "{not json");
    const refusingAside: Storage = {
      ...backing,
      getItem: (k) => backing.getItem(k),
      setItem: (k, v) => {
        if (k.startsWith("kerf.shop.setAside"))
          throw new DOMException("full", "QuotaExceededError");
        backing.setItem(k, v);
      },
    };
    const s = createKerfStore({ storage: createStorage(refusingAside), library: memoryLibrary() });
    s.getState().dismissNotice();
    s.getState().setShopRecord({ ...STARTER_RECORD, setUp: true, drill: true });
    expect(backing.getItem("kerf.shop")).toBe("{not json");
    expect(s.getState().shopRecord.drill).toBe(true);
    expect(s.getState().notice?.text).toBe(
      "Your shop couldn't be kept in this browser; it applies until you close the page.",
    );
  });
});

describe("a saved shop the browser could not read at start", () => {
  it("is said, the starter shop is used, and it is never written over", () => {
    const backing = unreadable(["kerf.shop"]);
    backing.setItem("kerf.shop", "the saved shop");
    const s = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
    expect(s.getState().shop).toEqual(STARTER_SHOP);
    expect(s.getState().notice).toEqual({
      text:
        "Your saved shop could not be read from this browser, so the starter shop is in use. " +
        "Your saved shop is left as it was.",
      kind: "warning",
    });
    s.getState().setShopRecord({ ...STARTER_RECORD, setUp: true });
    backing.readable(true);
    expect(backing.getItem("kerf.shop")).toBe("the saved shop");
  });
});
