// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Saving": the current project is kept in browser storage after every change, so a
// reload restores it; ADR 015, rule 11 for what happens when that cannot work.

import { type Project, serializeProject } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { type Edit, setSize, startProject } from "./commands";
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
    expect(s.getState().notice).toEqual({ text: told, undo: false });
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
    expect(s.getState().notice).toEqual({ text: warning, undo: false });
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

  it("replaces an Undo notice with the warning but leaves a plain notice showing", () => {
    const s = createKerfStore({ storage: full() });
    s.getState().apply(startProject("Bookcase", "imperial"), "Started");
    expect(s.getState().notice?.undo).toBe(false);
    expect(s.getState().notice?.text).toMatch(/^Your latest changes couldn't be kept/);

    const t = createKerfStore({ storage: full() });
    t.getState().say("Something else");
    t.getState().apply(startProject("Bookcase", "imperial"));
    expect(t.getState().notice?.text).toBe("Something else");
    t.getState().dismissNotice();
    t.getState().apply(startProject("Bookcase", "imperial"));
    expect(t.getState().notice).toBeNull();
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
      remove: (key) => {
        removed.push(key);
      },
    };
    const s = createKerfStore({ storage }).getState();
    expect(s.history).toBeNull();
    expect(s.notice?.text).toMatch(
      /^Your last project could not be opened \(.+\)\. It was left as it was\.$/,
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
