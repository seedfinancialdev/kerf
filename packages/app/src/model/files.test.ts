// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model, ".kerf file"; Review Focus 2: a damaged or newer file is refused in shop words and
// the current project is kept.

import { serializeProject } from "@kerf/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "../testing/banned-words";
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

  it("shows no engine path or banned word when the project inside is nonsense", () => {
    const text = serializeProject(project).replace('"name": "Bookcase"', '"name": 7');
    const meta = JSON.stringify({ schemaVersion: 1, appVersion: "0.4.0", ...times });
    const r = openKerfBytes(zipSync({ "project.json": strToU8(text), "meta.json": strToU8(meta) }));
    expect(r).toEqual({
      ok: false,
      message: "This file could not be opened: its contents are damaged or do not make sense.",
    });
  });

  it("words every refusal without engine paths or banned words", () => {
    const damaged = openKerfBytes(new TextEncoder().encode("not a zip"));
    expect(damaged).toEqual({
      ok: false,
      message: "This file could not be opened: it is not a Kerf file, or it is damaged.",
    });
    const text = serializeProject(project).replace('"schemaVersion": 1', '"schemaVersion": 2');
    const meta = JSON.stringify({ schemaVersion: 2, appVersion: "9.0.0", ...times });
    const newer = openKerfBytes(
      zipSync({ "project.json": strToU8(text), "meta.json": strToU8(meta) }),
    );
    for (const r of [damaged, newer]) {
      if (!r.ok) {
        expect(r.message).not.toContain("$");
        expect(bannedWordsIn(r.message)).toEqual([]);
      }
    }
  });
});
