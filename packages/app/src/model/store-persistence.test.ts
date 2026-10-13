// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": the current project is kept in browser storage after every change, so a
// reload restores it; ADR 015, rule 11 for what happens when that cannot work.

import { type Project, serializeProject } from "@kerf/core";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { type Edit, setSize, startProject } from "./commands";
import { STARTER_SHOP } from "./starter";
import { type AppStorage, createStorage } from "./storage";
import { createKerfStore, shownProject } from "./store";

const renamed = (p: Project): Edit => ({ project: { ...p, name: "Renamed" }, label: "Rename" });
const memory = (): AppStorage => createStorage(memoryStorage());

describe("the store across a reload", () => {
  it("brings back the last project, as one History entry", () => {
    const storage = memory();
    createKerfStore({ storage }).getState().apply(startProject("Bookcase", "imperial"));
    const again = createKerfStore({ storage }).getState();
    expect(again.history?.entries.map((e) => e.label)).toEqual(["Opened your last project"]);
    expect(again.solved?.result.cutList.lines).toHaveLength(3);
  });

  it("sets aside a stored project the engine rejects, says so, and starts empty", () => {
    const storage = memory();
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 7}');
    const s = createKerfStore({ storage }).getState();
    expect(s.history).toBeNull();
    expect(s.notice?.text).toMatch(/^Your last project could not be opened/);
    expect(storage.read("kerf.project.setAside")).toBe('{"schemaVersion": 1, "name": 7}');
    expect(storage.read("kerf.project")).toBeUndefined();
  });

  it("says once that work will not survive a reload when the browser has no storage", () => {
    const s = createKerfStore({ storage: createStorage(undefined) }).getState();
    expect(s.notice?.text).toBe(
      "This browser won't keep your work between visits. Use Save to keep a copy.",
    );
  });

  it("starts new projects in the units last chosen, even in a later session", () => {
    const storage = memory();
    createKerfStore({ storage }).getState().setUnitsForNew("metric");
    expect(createKerfStore({ storage }).getState().unitsForNew).toBe("metric");
  });

  it("leaves the units for new projects alone when a metric project is restored", () => {
    const storage = memory();
    createKerfStore({ storage }).getState().apply(startProject("Bookcase", "metric"));
    const again = createKerfStore({ storage }).getState();
    expect(shownProject(again)?.units).toBe("metric");
    expect(again.unitsForNew).toBe("imperial");
  });

  it("keeps the chosen units for new projects when an open project stays in the other ones", () => {
    const storage = memory();
    const s = createKerfStore({ storage });
    s.getState().apply(startProject("Bookcase", "imperial"));
    s.getState().setUnitsForNew("metric");
    s.getState().apply(startProject("Bookcase", "imperial"));
    expect(s.getState().unitsForNew).toBe("metric");
  });

  it("writes the project exactly as the engine saves it", () => {
    const storage = memory();
    const s = createKerfStore({ storage });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    expect(storage.read("kerf.project")).toBe(serializeProject(p));
  });

  it("stores the shown entry after an undo", () => {
    const storage = memory();
    const s = createKerfStore({ storage });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const first = shownProject(s.getState());
    if (!first) throw new Error("no project");
    s.getState().apply(renamed(first));
    s.getState().undo();
    expect(storage.read("kerf.project")).toBe(serializeProject(first));
  });

  it("does not touch storage while a drag is only previewed", () => {
    const storage = memory();
    const s = createKerfStore({ storage });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const before = storage.read("kerf.project");
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    s.getState().preview(renamed(p).project);
    expect(storage.read("kerf.project")).toBe(before);
  });
});

describe("a browser store that cannot be written", () => {
  const full = (): AppStorage => createStorage(memoryStorage(true));

  it("uses the chosen units for new projects until the page closes, and says so once", () => {
    const s = createKerfStore({ storage: full() });
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

  it("keeps working and warns once that the latest changes were not kept", () => {
    const s = createKerfStore({ storage: full() });
    s.getState().apply(startProject("Bookcase", "imperial"));
    const warning =
      "Your latest changes couldn't be kept in this browser. Use Save to keep a copy.";
    expect(s.getState().notice).toEqual({ text: warning, kind: "warning" });
    s.getState().dismissNotice();
    const p = shownProject(s.getState());
    if (!p) throw new Error("no project");
    expect(s.getState().solved?.result.cutList.lines).toHaveLength(3);
    const resized = setSize(p, p.structures[0]?.id ?? "", "w", '30"');
    if (!resized.ok) throw new Error(resized.message);
    s.getState().apply(resized.edit);
    expect(s.getState().notice).toBeNull();
    expect(s.getState().solved?.result.cutList.lines).toHaveLength(3);
    expect(s.getState().history?.entries).toHaveLength(2);
  });

  it("keeps an Undo offer and shows the warning after it (re-review N3)", () => {
    const s = createKerfStore({ storage: full() });
    const offer = "Shelf 2 now overlaps Back; Undo puts it back.";
    s.getState().apply(startProject("Bookcase", "imperial"), offer);
    expect(s.getState().notice).toEqual({ text: offer, kind: "undo" });
    s.getState().dismissNotice();
    expect(s.getState().notice?.text).toMatch(/^Your latest changes couldn't be kept/);
  });

  it("does not remember the units when the project was not kept", () => {
    const storage = full();
    createKerfStore({ storage }).getState().apply(startProject("Bookcase", "metric"));
    expect(storage.read("kerf.units")).toBeUndefined();
  });

  it("leaves a rejected stored project where it is when it cannot be set aside", () => {
    const bad = '{"schemaVersion": 1, "name": 7}';
    const removed: string[] = [];
    const storage: AppStorage = {
      available: true,
      read: (key) => (key === "kerf.project" ? bad : undefined),
      write: () => false,
      couldNotRead: () => false,
      remove: (key) => {
        removed.push(key);
      },
    };
    const s = createKerfStore({ storage }).getState();
    expect(s.history).toBeNull();
    expect(s.notice?.text).toMatch(
      "Your last project could not be opened: its contents are damaged or do not make sense. " +
        "It was left where it was.",
    );
    expect(removed).toEqual([]);
  });
});

describe("when a project began", () => {
  it("is noted by begin, and survives a reload", () => {
    const storage = memory();
    const s = createKerfStore({ storage, clockDate: () => Date.UTC(2026, 9, 12) });
    s.getState().begin(startProject("Bookcase", "imperial"));
    expect(s.getState().created).toBe("2026-10-12T00:00:00.000Z");
    expect(createKerfStore({ storage }).getState().created).toBe("2026-10-12T00:00:00.000Z");
  });

  it("records a project even when it is the one already shown, so opening a saved copy is in History", () => {
    const s = createKerfStore({ storage: memory() });
    s.getState().begin(startProject("Bookcase", "imperial"));
    s.getState().begin({
      label: "Opened Bookcase.kerf",
      project: startProject("Bookcase", "imperial").project,
    });
    expect(s.getState().history?.entries.map((e) => e.label)).toEqual([
      "New bookcase",
      "Opened Bookcase.kerf",
    ]);
  });
});

describe("warnings that must not be lost (ADR 015, rule 11: the app says so once)", () => {
  const full = (): AppStorage => createStorage(memoryStorage(true));
  const NOT_KEPT_TEXT =
    "Your latest changes couldn't be kept in this browser. Use Save to keep a copy.";

  it("shows the not-kept warning after a plain notice that was showing is dismissed", () => {
    const s = createKerfStore({ storage: full() });
    s.getState().say("Something else");
    s.getState().apply(startProject("Bookcase", "imperial"));
    expect(s.getState().notice?.text).toBe("Something else");
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: NOT_KEPT_TEXT, kind: "warning" });
  });

  it("keeps the set-aside warning when the 3D view's warning arrives, and shows that one next", () => {
    const storage = memory();
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 7}');
    const s = createKerfStore({ storage });
    const view = "The 3D view could not start (no WebGL), so boards are shown as plain blanks.";
    s.getState().warn(view);
    expect(s.getState().notice?.text).toMatch(/^Your last project could not be opened/);
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: view, kind: "warning" });
  });

  it("shows every start-up warning in turn: the shop's, then the project's", () => {
    const storage = memory();
    storage.write("kerf.shop", "not json");
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 7}');
    const s = createKerfStore({ storage });
    expect(s.getState().notice?.text).toMatch(/^Your saved shop could not be used/);
    s.getState().dismissNotice();
    expect(s.getState().notice?.text).toMatch(/^Your last project could not be opened/);
  });

  it("shows an answer at once over a warning, and the warning again once it is dismissed", () => {
    const s = createKerfStore({ storage: createStorage(undefined) });
    const nothingKept = s.getState().notice?.text;
    s.getState().say("A distance of zero changes nothing.");
    expect(s.getState().notice?.text).toBe("A distance of zero changes nothing.");
    s.getState().dismissNotice();
    expect(s.getState().notice).toEqual({ text: nothingKept, kind: "warning" });
  });
});

describe("a shop change the browser cannot keep (silent-failure review I3)", () => {
  it("is used until the page closes, and the user is told once", () => {
    const s = createKerfStore({ storage: createStorage(memoryStorage(true)) });
    // Blade kerf 1/8" = 203200 / 8 = 25400.
    const shop = { ...s.getState().shop, kerf: 25_400 };
    s.getState().setShop(shop);
    expect(s.getState().shop.kerf).toBe(25_400);
    expect(s.getState().notice).toEqual({
      text: "Your shop couldn't be kept in this browser; it applies until you close the page.",
      kind: "warning",
    });
    s.getState().dismissNotice();
    s.getState().setShop({ ...shop, kerf: 12_700 });
    expect(s.getState().notice).toBeNull();
  });
});

describe("a stored project the engine rejects (code review I1, silent-failure review M5)", () => {
  /** The hand-made bookcase as stored, its first board naming a part the project does not have. */
  const brokenText = (): string => {
    const stored = JSON.parse(serializeProject(handMadeBookcase()));
    stored.instances[0].def = "01J9ZZZZZZZZZZZZZZZZZZZZZZ";
    return JSON.stringify(stored);
  };

  it("is described in shop words, with no file path or banned word from the engine", () => {
    const storage = memory();
    storage.write("kerf.project", brokenText());
    const text = createKerfStore({ storage }).getState().notice?.text ?? "";
    expect(text).toBe(
      "Your last project could not be opened: its contents are damaged or do not make sense. " +
        "It was set aside in this browser.",
    );
    expect(text).not.toMatch(/\$/);
    expect(bannedWordsIn(text)).toEqual([]);
  });

  it("does not overwrite a copy set aside earlier", () => {
    const storage = memory();
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 7}');
    createKerfStore({ storage });
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 8}');
    createKerfStore({ storage });
    expect(storage.read("kerf.project.setAside")).toBe('{"schemaVersion": 1, "name": 7}');
    expect(storage.read("kerf.project.setAside.2")).toBe('{"schemaVersion": 1, "name": 8}');
  });
});

describe("section open state that storage holds damaged (PR review tests-M3)", () => {
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
    expect(createKerfStore({ storage }).getState().sections).toEqual(sections);
  });
});

describe("work the browser could not read at start (PR review errors-M2)", () => {
  const PROJECT_UNREADABLE =
    "Your last project could not be read from this browser, so Kerf started without it. It is " +
    "left as it was; use Save to keep a copy of new work.";
  const SHOP_UNREADABLE =
    "Your saved shop could not be read from this browser, so the starter shop is in use. Your " +
    "saved shop is left as it was.";

  it("says the last project could not be read, and never writes over it", () => {
    const backing = unreadable(["kerf.project"]);
    backing.setItem("kerf.project", "the last project");
    const s = createKerfStore({ storage: createStorage(backing) });
    expect(s.getState().history).toBeNull();
    expect(s.getState().notice).toEqual({ text: PROJECT_UNREADABLE, kind: "warning" });
    s.getState().apply(startProject("Bookcase", "imperial"));
    backing.readable(true);
    expect(backing.getItem("kerf.project")).toBe("the last project");
  });

  it("says the saved shop could not be read, uses the starter shop, and never writes over it", () => {
    const backing = unreadable(["kerf.shop"]);
    backing.setItem("kerf.shop", "the saved shop");
    const s = createKerfStore({ storage: createStorage(backing) });
    expect(s.getState().shop).toEqual(STARTER_SHOP);
    expect(s.getState().notice).toEqual({ text: SHOP_UNREADABLE, kind: "warning" });
    s.getState().setShop({ ...STARTER_SHOP, kerf: 0 });
    backing.readable(true);
    expect(backing.getItem("kerf.shop")).toBe("the saved shop");
  });
});
