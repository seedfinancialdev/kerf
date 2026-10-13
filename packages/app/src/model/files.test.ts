// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model, ".kerf file"; Review Focus 2: a damaged or newer file is refused in shop words and
// the current project is kept.

import { serializeProject } from "@kerf/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { startProject } from "./commands";
import { fileNameFor, openKerfBytes, saveKerfBytes } from "./files";

const times = { created: "2026-10-12T10:00:00.000Z", modified: "2026-10-12T11:00:00.000Z" };
const project = startProject("Bookcase", "imperial").project;

describe("files", () => {
  it("opens what it saved, byte for byte the same project", () => {
    const opened = openKerfBytes(saveKerfBytes(project, times));
    expect(opened.ok && serializeProject(opened.project)).toBe(serializeProject(project));
  });

  it("refuses bytes that are not a .kerf file, saying so plainly", () => {
    const r = openKerfBytes(new TextEncoder().encode("not a zip"));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/^This file could not be opened: /);
  });

  it("refuses a file from a newer Kerf, saying it is newer", () => {
    const text = serializeProject(project).replace('"schemaVersion": 1', '"schemaVersion": 2');
    const meta = JSON.stringify({ schemaVersion: 2, appVersion: "9.0.0", ...times });
    const bytes = zipSync({ "project.json": strToU8(text), "meta.json": strToU8(meta) });
    const r = openKerfBytes(bytes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/newer/i);
  });

  it("names the file after the project", () => {
    expect(fileNameFor(project)).toBe("Bookcase.kerf");
  });

  it("makes a safe file name from any project name", () => {
    expect(fileNameFor({ ...project, name: 'Shop/Cabinet: "v2"' })).toBe("Shop-Cabinet-v2.kerf");
  });
});
