// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// .kerf / project.json round trip (Domain model v0: invariants, `.kerf` file). Milestone M1.

import { parseProject, serializeProject } from "@kerf/core";
import { readKerf, writeKerf } from "@kerf/io";
import { describe, expect } from "vitest";
import { loadProject, projectText, REFERENCE_PROJECTS } from "../../src/index";
import { milestone } from "../../src/milestone";

describe.each(REFERENCE_PROJECTS)("%s project file", (name) => {
  milestone("M1", "load -> save is byte-identical", () => {
    const text = projectText(name);
    expect(serializeProject(parseProject(text))).toBe(text);
  });

  milestone("M1", "saved file contains no derived data", () => {
    const saved = serializeProject(loadProject(name));
    for (const key of ["cutList", "removals", "mesh", "setups"]) {
      expect(saved).not.toContain(`"${key}"`);
    }
  });

  milestone("M1", ".kerf zip round-trips the project", () => {
    const project = loadProject(name);
    const meta = {
      schemaVersion: 1,
      appVersion: "0.0.0",
      created: "2026-10-09T00:00:00.000Z",
      modified: "2026-10-09T00:00:00.000Z",
    };
    const bytes = writeKerf(project, meta);
    expect(readKerf(bytes).project).toEqual(project);
  });
});
