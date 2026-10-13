// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11 and the PR review (errors-I1): a fault in Kerf while it opens the stored project
// never stops the app starting. The stored project is set aside, as one the engine rejects is, and
// the user is told. No real project makes the engine fault, so its entry points are replaced here
// (UNIT_TEST_STANDARD §3: a mock only where the real thing cannot do it), and only for the start.

import { serializeProject } from "@kerf/core";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { startProject } from "./commands";
import { createStorage } from "./storage";
import { createKerfStore } from "./store";

const faulty = vi.hoisted(() => ({ parse: false, solve: false }));
const fault = vi.hoisted(() => new TypeError("x is undefined"));

vi.mock("@kerf/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@kerf/core")>();
  return {
    ...core,
    parseProject: (...args: Parameters<typeof core.parseProject>) => {
      if (faulty.parse) throw fault;
      return core.parseProject(...args);
    },
    solve: (...args: Parameters<typeof core.solve>) => {
      if (faulty.solve) throw fault;
      return core.solve(...args);
    },
  };
});

const SET_ASIDE =
  "Kerf hit a problem opening your last project; please report it. It was set aside in this browser.";

describe("a fault in Kerf while it opens the stored project", () => {
  let logged: MockInstance;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    faulty.parse = false;
    faulty.solve = false;
    logged.mockRestore();
  });

  it.each([
    ["reading it", "parse"],
    ["solving it", "solve"],
  ] as const)("starts empty, sets the project aside and says so, after a fault %s", (_, where) => {
    const storage = createStorage(memoryStorage());
    const text = serializeProject(startProject("Bookcase", "imperial").project);
    storage.write("kerf.project", text);
    faulty[where] = true;
    const s = createKerfStore({ storage }).getState();
    faulty[where] = false;
    expect(s.history).toBeNull();
    expect(s.notice).toEqual({ text: SET_ASIDE, kind: "warning" });
    expect(storage.read("kerf.project.setAside")).toBe(text);
    expect(storage.read("kerf.project")).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(fault);
  });
});
