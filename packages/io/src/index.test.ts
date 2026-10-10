// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type Project, ProjectFormatError, serializeProject } from "@kerf/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { KerfFormatError, type KerfMeta, readKerf, writeKerf } from "./index";

/** Asserts the call throws an error of this class whose message matches. */
const throwsA = (
  fn: () => unknown,
  cls: abstract new (...args: never[]) => Error,
  message: RegExp,
): void => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(cls);
  expect((caught as Error).message).toMatch(message);
};

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
    throwsA(() => readKerf(noProject), KerfFormatError, /no project\.json/);
    const noMeta = zipSync({ "project.json": strToU8("{}") });
    throwsA(() => readKerf(noMeta), KerfFormatError, /no meta\.json/);
  });

  it("rejects a file saved by a newer schema", () => {
    const newer = zipSync({
      "project.json": strToU8("{}"),
      "meta.json": strToU8(JSON.stringify({ ...meta, schemaVersion: 2 })),
    });
    throwsA(() => readKerf(newer), KerfFormatError, /newer version/);
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
    throwsA(() => readKerf(entries({ "notes.txt": "hi" })), KerfFormatError, /unexpected entry/);
  });

  it("rejects unknown meta fields and malformed meta", () => {
    throwsA(() => readKerf(entries({}, { extra: 1 })), KerfFormatError, /unknown field/);
    throwsA(() => readKerf(entries({}, { schemaVersion: 0 })), KerfFormatError, /schemaVersion/);
    throwsA(() => readKerf(entries({}, { schemaVersion: 1.5 })), KerfFormatError, /schemaVersion/);
    throwsA(() => readKerf(entries({}, { planLicense: 7 })), KerfFormatError, /planLicense/);
    throwsA(() => readKerf(entries({}, { appVersion: 7 })), KerfFormatError, /appVersion/);
  });

  it("rejects meta that is not JSON or not an object", () => {
    const notJson = zipSync({ "project.json": strToU8("{}"), "meta.json": strToU8("nope") });
    throwsA(() => readKerf(notJson), KerfFormatError, /meta\.json is not valid JSON/);
    const list = zipSync({ "project.json": strToU8("{}"), "meta.json": strToU8("[]") });
    throwsA(() => readKerf(list), KerfFormatError, /must be an object/);
  });

  it("rejects a thumbnail that is not a PNG, and invalid UTF-8", () => {
    expect(() => readKerf(entries({ "thumbnail.png": new Uint8Array([1, 2, 3, 4]) }))).toThrow(
      /PNG/,
    );
    const badText = zipSync({
      "project.json": new Uint8Array([0xff, 0xfe, 0xfd]),
      "meta.json": strToU8(JSON.stringify(meta)),
    });
    throwsA(() => readKerf(badText), KerfFormatError, /UTF-8/);
  });

  it("refuses to write meta it would later refuse to read", () => {
    throwsA(
      () => writeKerf(project, { ...meta, schemaVersion: 0 }),
      KerfFormatError,
      /schemaVersion/,
    );
    throwsA(
      () => writeKerf(project, { ...meta, schemaVersion: 2 }),
      KerfFormatError,
      /schemaVersion/,
    );
  });

  it("refuses to write an invalid project", () => {
    expect(() => writeKerf({ ...project, name: 3 } as never, meta)).toThrow(ProjectFormatError);
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

describe(".kerf archive: second review", () => {
  const enc = (v: unknown) => strToU8(JSON.stringify(v));

  /** Rewrites the declared uncompressed size of every entry (local and central headers). */
  function lie(bytes: Uint8Array, size: number): Uint8Array {
    const out = new Uint8Array(bytes);
    const view = new DataView(out.buffer);
    for (let i = 0; i + 4 < out.length; i += 1) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50) view.setUint32(i + 22, size, true);
      if (sig === 0x02014b50) view.setUint32(i + 24, size, true);
    }
    return out;
  }

  it("does not trust a stored entry that declares a small size", () => {
    const big = { ...meta, appVersion: "x".repeat(100 * 1024) };
    const zip = zipSync({
      "project.json": [enc(project), { level: 0 }],
      "meta.json": [enc(big), { level: 0 }],
    });
    throwsA(() => readKerf(lie(zip, 10)), KerfFormatError, /too large|invalid|not a \.kerf/i);
  });

  it("rejects an entry name that appears twice", () => {
    const zip = zipSync({
      "project.json": enc(project),
      "project.jsoX": enc(project),
      "meta.json": enc(meta),
    });
    const dup = new Uint8Array(zip);
    const x = "project.jsoX";
    for (let i = 0; i + x.length < dup.length; i += 1) {
      if (x.split("").every((c, j) => dup[i + j] === c.charCodeAt(0)))
        dup[i + x.length - 1] = "n".charCodeAt(0);
    }
    throwsA(() => readKerf(dup), KerfFormatError, /more than once|duplicate/i);
  });

  it("refuses to write a thumbnail it would later refuse to read", () => {
    throwsA(() => writeKerf(project, meta, new Uint8Array([1, 2, 3])), KerfFormatError, /PNG/);
  });
});

describe(".kerf archive: damage is detected, not just luck", () => {
  it("rejects an entry whose bytes changed but still read as valid JSON", () => {
    // Stored (not compressed), so a changed letter cannot break the deflate stream by accident.
    const bytes = zipSync(
      {
        "project.json": strToU8(serializeProject(project)),
        "meta.json": strToU8(JSON.stringify(meta)),
      },
      { level: 0 },
    );
    const at = bytes.findIndex(
      (_, i) => bytes[i] === 0x45 && bytes[i + 1] === 0x6d && bytes[i + 2] === 0x70, // "Emp"
    );
    expect(at).toBeGreaterThan(0);
    const damaged = bytes.slice();
    damaged[at + 3] = 0x69; // "Empty" -> "Empiy"
    expect(() => readKerf(damaged)).toThrow(KerfFormatError);
    throwsA(() => readKerf(damaged), KerfFormatError, /damaged/);
    expect(readKerf(bytes).project.name).toBe("Empty");
  });
});

describe(".kerf archive: clock independence", () => {
  it("stamps every entry with the fixed ZIP epoch (1980-01-01 00:00), whatever the local clock", () => {
    const bytes = writeKerf(project, meta);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let headers = 0;
    for (let i = 0; i + 14 < bytes.length; i += 1) {
      if (view.getUint32(i, true) === 0x04034b50) {
        headers += 1;
        expect(view.getUint16(i + 10, true)).toBe(0); // time 00:00:00
        expect(view.getUint16(i + 12, true)).toBe(0x21); // date 1980-01-01
      }
    }
    expect(headers).toBe(2);
  });
});
