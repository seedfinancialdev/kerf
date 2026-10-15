// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: the one project older Kerf kept in browser storage is read for its move into
// the library (ADR 016, D5). One that cannot be opened is set aside, never deleted, and said in
// shop words; one the browser would not let be read is left as it was.

import { serializeProject } from "@kerf/core";
import { handMadeBookcase } from "@kerf/fixtures/builders";
import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "../testing/banned-words";
import { memoryStorage, unreadable } from "../testing/memory-storage";
import { startProject } from "./commands";
import { restoreProject } from "./persist";
import { type AppStorage, createStorage } from "./storage";

const memory = (): AppStorage => createStorage(memoryStorage());

/** The bookcase as stored, with its schema version changed to `version`. */
const withSchemaVersion = (version: number): string =>
  serializeProject(startProject("Bookcase", "imperial").project).replace(
    '"schemaVersion": 1',
    `"schemaVersion": ${version}`,
  );

describe("restoreProject()", () => {
  it("gives the stored project as one History entry", () => {
    const storage = memory();
    storage.write("kerf.project", serializeProject(startProject("Bookcase", "imperial").project));
    const { history } = restoreProject(storage);
    expect(history?.entries.map((e) => e.label)).toEqual(["Opened your last project"]);
  });

  it("calls a stored project with schema version 0 damaged, not newer", () => {
    const storage = memory();
    storage.write("kerf.project", withSchemaVersion(0));
    expect(restoreProject(storage).problem).toBe(
      "Your last project could not be opened: its contents are damaged or do not make sense. " +
        "It was set aside in this browser.",
    );
  });

  it("says a stored project from a newer Kerf is newer, not damaged, and sets it aside", () => {
    const storage = memory();
    const text = withSchemaVersion(2);
    storage.write("kerf.project", text);
    const restored = restoreProject(storage);
    expect(restored.history).toBeNull();
    expect(restored.problem).toBe(
      "Your last project was made by a newer version of Kerf; update Kerf to open it. " +
        "It was set aside in this browser.",
    );
    expect(storage.read("kerf.project.setAside")).toBe(text);
    expect(storage.read("kerf.project")).toBeUndefined();
  });

  it("leaves a rejected stored project where it is when it cannot be set aside", () => {
    const removed: string[] = [];
    const storage: AppStorage = {
      available: true,
      read: (key) => (key === "kerf.project" ? '{"schemaVersion": 1, "name": 7}' : undefined),
      write: () => false,
      couldNotRead: () => false,
      remove: (key) => {
        removed.push(key);
      },
    };
    expect(restoreProject(storage).problem).toBe(
      "Your last project could not be opened: its contents are damaged or do not make sense. " +
        "It was left where it was.",
    );
    expect(removed).toEqual([]);
  });

  it("describes a project the engine rejects in shop words, with no file path or banned word", () => {
    const stored = JSON.parse(serializeProject(handMadeBookcase()));
    // Its first board names a part the project does not have.
    stored.instances[0].def = "01J9ZZZZZZZZZZZZZZZZZZZZZZ";
    const storage = memory();
    storage.write("kerf.project", JSON.stringify(stored));
    const text = restoreProject(storage).problem ?? "";
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
    restoreProject(storage);
    storage.write("kerf.project", '{"schemaVersion": 1, "name": 8}');
    restoreProject(storage);
    expect(storage.read("kerf.project.setAside")).toBe('{"schemaVersion": 1, "name": 7}');
    expect(storage.read("kerf.project.setAside.2")).toBe('{"schemaVersion": 1, "name": 8}');
  });

  it("says the stored project could not be read, and leaves it as it was", () => {
    const backing = unreadable(["kerf.project"]);
    backing.setItem("kerf.project", "the last project");
    const storage = createStorage(backing);
    expect(restoreProject(storage)).toEqual({
      history: null,
      problem:
        "Your last project could not be read from this browser, so Kerf started without it. It " +
        'is left as it was; click the project\'s name, then "Download .kerf file", to keep new work.',
    });
    backing.readable(true);
    expect(backing.getItem("kerf.project")).toBe("the last project");
  });
});
