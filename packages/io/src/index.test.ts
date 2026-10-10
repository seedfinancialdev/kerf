// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type Project, ProjectFormatError } from "@kerf/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { KerfFormatError, type KerfMeta, readKerf, writeKerf } from "./index";

const project: Project = {
  schemaVersion: 1,
  name: "Empty",
  units: "imperial",
  params: [],
  stock: [],
  parts: [],
  instances: [],
  patterns: [],
  joints: [],
  matchSets: [],
  structures: [],
};

const meta: KerfMeta = {
  schemaVersion: 1,
  appVersion: "0.0.0",
  created: "2026-10-09T00:00:00.000Z",
  modified: "2026-10-09T00:00:00.000Z",
};

describe(".kerf archive", () => {
  it("round-trips project, meta and thumbnail", () => {
    const thumbnail = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const read = readKerf(writeKerf(project, { ...meta, planLicense: "CC-BY-4.0" }, thumbnail));
    expect(read.project).toEqual(project);
    expect(read.meta).toEqual({ ...meta, planLicense: "CC-BY-4.0" });
    expect(read.thumbnail).toEqual(thumbnail);
  });

  it("is deterministic: the same inputs give the same bytes", () => {
    expect(writeKerf(project, meta)).toEqual(writeKerf(project, meta));
  });

  it("rejects bytes that are not a zip", () => {
    expect(() => readKerf(new Uint8Array([1, 2, 3]))).toThrow(KerfFormatError);
  });

  it("rejects an archive without project.json or meta.json", () => {
    const noProject = zipSync({ "meta.json": strToU8(JSON.stringify(meta)) });
    expect(() => readKerf(noProject)).toThrow(/no project\.json/);
    const noMeta = zipSync({ "project.json": strToU8("{}") });
    expect(() => readKerf(noMeta)).toThrow(/no meta\.json/);
  });

  it("rejects a file saved by a newer schema", () => {
    const newer = zipSync({
      "project.json": strToU8("{}"),
      "meta.json": strToU8(JSON.stringify({ ...meta, schemaVersion: 2 })),
    });
    expect(() => readKerf(newer)).toThrow(/newer version/);
  });

  it("rejects a project that does not validate", () => {
    const bad = zipSync({
      "project.json": strToU8(JSON.stringify({ ...project, name: 3 })),
      "meta.json": strToU8(JSON.stringify(meta)),
    });
    expect(() => readKerf(bad)).toThrow(ProjectFormatError);
  });
});

describe(".kerf archive: strictness", () => {
  const entries = (extra: Record<string, Uint8Array | string> = {}, metaOverride: object = {}) => {
    const files: Record<string, Uint8Array> = {
      "project.json": strToU8(JSON.stringify(project)),
      "meta.json": strToU8(JSON.stringify({ ...meta, ...metaOverride })),
    };
    for (const [name, value] of Object.entries(extra)) {
      files[name] = typeof value === "string" ? strToU8(value) : value;
    }
    return zipSync(files);
  };

  it("has no thumbnail when none was stored", () => {
    expect(readKerf(writeKerf(project, meta)).thumbnail).toBeUndefined();
  });

  it("rejects entries it does not know, so nothing is silently dropped", () => {
    expect(() => readKerf(entries({ "notes.txt": "hi" }))).toThrow(/unexpected entry/);
  });

  it("rejects unknown meta fields and malformed meta", () => {
    expect(() => readKerf(entries({}, { extra: 1 }))).toThrow(/unknown field/);
    expect(() => readKerf(entries({}, { schemaVersion: 0 }))).toThrow(/schemaVersion/);
    expect(() => readKerf(entries({}, { schemaVersion: 1.5 }))).toThrow(/schemaVersion/);
    expect(() => readKerf(entries({}, { planLicense: 7 }))).toThrow(/planLicense/);
    expect(() => readKerf(entries({}, { appVersion: 7 }))).toThrow(/appVersion/);
  });

  it("rejects meta that is not JSON or not an object", () => {
    const notJson = zipSync({ "project.json": strToU8("{}"), "meta.json": strToU8("nope") });
    expect(() => readKerf(notJson)).toThrow(/meta\.json is not valid JSON/);
    const list = zipSync({ "project.json": strToU8("{}"), "meta.json": strToU8("[]") });
    expect(() => readKerf(list)).toThrow(/must be an object/);
  });

  it("rejects a thumbnail that is not a PNG, and invalid UTF-8", () => {
    expect(() => readKerf(entries({ "thumbnail.png": new Uint8Array([1, 2, 3, 4]) }))).toThrow(
      /PNG/,
    );
    const badText = zipSync({
      "project.json": new Uint8Array([0xff, 0xfe, 0xfd]),
      "meta.json": strToU8(JSON.stringify(meta)),
    });
    expect(() => readKerf(badText)).toThrow(/UTF-8/);
  });

  it("refuses to write meta it would later refuse to read", () => {
    expect(() => writeKerf(project, { ...meta, schemaVersion: 0 })).toThrow(/schemaVersion/);
    expect(() => writeKerf(project, { ...meta, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });

  it("refuses to write an invalid project", () => {
    expect(() => writeKerf({ ...project, name: 3 } as never, meta)).toThrow(ProjectFormatError);
  });

  it("limits how large an entry may expand to (zip bomb guard)", () => {
    const bomb = zipSync({
      "project.json": new Uint8Array(40 * 1024 * 1024).fill(32),
      "meta.json": strToU8(JSON.stringify(meta)),
    });
    expect(() => readKerf(bomb)).toThrow(/too large/);
  });

  it("keeps the cause of a corrupt archive", () => {
    try {
      readKerf(new Uint8Array([80, 75, 3, 4, 0, 0]));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(KerfFormatError);
      expect((error as Error).cause).toBeDefined();
    }
  });
});
