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
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
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
