// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// `.kerf` files: a zip with project.json, meta.json and an optional thumbnail.png
// (Domain model v0, "`.kerf` file"). Reading is strict (unknown entries and fields are errors,
// so nothing is silently dropped) and writing is deterministic, so identical projects give
// identical bytes and diff cleanly in git.

import {
  CURRENT_SCHEMA_VERSION,
  notImplemented,
  type Project,
  parseProject,
  serializeProject,
} from "@kerf/core";
import { strToU8, unzipSync, zipSync } from "fflate";

// Present in every browser and in Node; declared here because this package targets neither DOM nor
// Node typings.
declare const TextDecoder: new (
  label: string,
  options: { fatal: boolean },
) => { decode(bytes: Uint8Array): string };

export interface KerfMeta {
  schemaVersion: number;
  appVersion: string;
  /** ISO 8601 timestamps. */
  created: string;
  modified: string;
  /** License of a published plan, if any. */
  planLicense?: string;
}

/** Thrown for a `.kerf` file that is not a valid archive or is missing required entries. */
export class KerfFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "KerfFormatError";
  }
}

const PROJECT = "project.json";
const META = "meta.json";
const THUMBNAIL = "thumbnail.png";
const KNOWN = new Set([PROJECT, META, THUMBNAIL]);

/** Largest size, in bytes, each entry may expand to. */
const MAX_SIZE: Record<string, number> = {
  [PROJECT]: 32 * 1024 * 1024,
  [META]: 64 * 1024,
  [THUMBNAIL]: 8 * 1024 * 1024,
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const META_KEYS = new Set(["schemaVersion", "appVersion", "created", "modified", "planLicense"]);

function text(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new KerfFormatError(`${name} is not valid UTF-8 text.`, { cause });
  }
}

function checkMeta(raw: unknown): KerfMeta {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new KerfFormatError(`${META} must be an object`);
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!META_KEYS.has(key)) throw new KerfFormatError(`${META}: unknown field "${key}"`);
  }
  const str = (key: string): string => {
    const v = o[key];
    if (typeof v !== "string") throw new KerfFormatError(`${META}: "${key}" must be text`);
    return v;
  };
  const schemaVersion = o.schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new KerfFormatError(`${META}: "schemaVersion" must be a whole number from 1`);
  }
  const meta: KerfMeta = {
    schemaVersion,
    appVersion: str("appVersion"),
    created: str("created"),
    modified: str("modified"),
  };
  if (o.planLicense !== undefined) meta.planLicense = str("planLicense");
  return meta;
}

function readMeta(source: string): KerfMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (cause) {
    throw new KerfFormatError(`${META} is not valid JSON`, { cause });
  }
  const meta = checkMeta(raw);
  if (meta.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new KerfFormatError(
      `This file was saved by a newer version of Kerf (schema ${meta.schemaVersion}).`,
    );
  }
  return meta;
}

function metaText(meta: KerfMeta): string {
  const checked = checkMeta(meta);
  if (checked.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new KerfFormatError(
      `${META}: "schemaVersion" must be ${CURRENT_SCHEMA_VERSION}; Kerf never writes an older version`,
    );
  }
  const ordered: Record<string, unknown> = {
    appVersion: checked.appVersion,
    created: checked.created,
    modified: checked.modified,
    ...(checked.planLicense === undefined ? {} : { planLicense: checked.planLicense }),
    schemaVersion: checked.schemaVersion,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Fixed timestamp (local 1980-01-01, the ZIP epoch) so output never depends on the clock. */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

/**
 * Writes a `.kerf` archive. Throws ProjectFormatError if the project does not validate and
 * KerfFormatError if the meta would not be readable back.
 */
export function writeKerf(project: Project, meta: KerfMeta, thumbnail?: Uint8Array): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [PROJECT]: strToU8(serializeProject(project)),
    [META]: strToU8(metaText(meta)),
  };
  if (thumbnail) entries[THUMBNAIL] = thumbnail;
  return zipSync(entries, { level: 6, mtime: ZIP_EPOCH });
}

/**
 * Reads a `.kerf` archive, migrating the project forward.
 * Throws KerfFormatError or ProjectFormatError.
 */
export function readKerf(bytes: Uint8Array): {
  project: Project;
  meta: KerfMeta;
  thumbnail?: Uint8Array;
} {
  const unexpected: string[] = [];
  const oversize: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (!KNOWN.has(file.name)) {
          unexpected.push(file.name);
          return false;
        }
        if (file.originalSize > (MAX_SIZE[file.name] ?? 0)) {
          oversize.push(file.name);
          return false;
        }
        return true;
      },
    });
  } catch (cause) {
    throw new KerfFormatError("Not a .kerf file (could not open the archive).", { cause });
  }
  if (unexpected.length > 0) {
    throw new KerfFormatError(`The archive has an unexpected entry: ${unexpected.join(", ")}.`);
  }
  if (oversize.length > 0) {
    throw new KerfFormatError(`The archive entry ${oversize.join(", ")} is too large.`);
  }

  const projectBytes = entries[PROJECT];
  const metaBytes = entries[META];
  if (!projectBytes) throw new KerfFormatError(`The archive has no ${PROJECT}.`);
  if (!metaBytes) throw new KerfFormatError(`The archive has no ${META}.`);

  const meta = readMeta(text(metaBytes, META));
  const project = parseProject(text(projectBytes, PROJECT));
  const result: { project: Project; meta: KerfMeta; thumbnail?: Uint8Array } = { meta, project };

  const thumbnail = entries[THUMBNAIL];
  if (thumbnail) {
    if (!PNG_SIGNATURE.every((byte, i) => thumbnail[i] === byte)) {
      throw new KerfFormatError(`${THUMBNAIL} is not a PNG image.`);
    }
    result.thumbnail = thumbnail;
  }
  return result;
}

/** .skp import spike via OpenSKP (M5). */
export function importSkp(_bytes: Uint8Array): Project {
  return notImplemented("importSkp");
}
