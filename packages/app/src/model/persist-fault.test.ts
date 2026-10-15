// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: a fault in Kerf while it reads the project older Kerf kept never stops the app
// starting. The stored project is set aside, as one the engine rejects is, and the user is told.
// No real project makes the engine fault, so its entry point is replaced here
// (UNIT_TEST_STANDARD §3: a mock only where the real thing cannot do it).

import { serializeProject } from "@kerf/core";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { memoryStorage } from "../testing/memory-storage";
import { startProject } from "./commands";
import { restoreProject } from "./persist";
import { createStorage } from "./storage";

const faulty = vi.hoisted(() => ({ parse: false }));
const fault = vi.hoisted(() => new TypeError("x is undefined"));

vi.mock("@kerf/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@kerf/core")>();
  return {
    ...core,
    parseProject: (...args: Parameters<typeof core.parseProject>) => {
      if (faulty.parse) throw fault;
      return core.parseProject(...args);
    },
  };
});

const SET_ASIDE =
  "Kerf hit a problem opening your last project; please report it. It was set aside in this browser.";

describe("a fault in Kerf while it reads the stored project", () => {
  let logged: MockInstance;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    faulty.parse = false;
    logged.mockRestore();
  });

  it("sets the project aside, says it is Kerf's problem, and logs the fault", () => {
    const storage = createStorage(memoryStorage());
    const text = serializeProject(startProject("Bookcase", "imperial").project);
    storage.write("kerf.project", text);
    faulty.parse = true;
    expect(restoreProject(storage)).toEqual({ history: null, problem: SET_ASIDE });
    expect(storage.read("kerf.project.setAside")).toBe(text);
    expect(storage.read("kerf.project")).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(fault);
  });
});
