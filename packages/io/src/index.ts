// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// `.kerf` files: a zip with project.json, meta.json and an optional thumbnail.png
// (Domain model v0, "`.kerf` file"). Writing is deterministic, so identical projects give
// identical bytes and diff cleanly in git.

import {
  CURRENT_SCHEMA_VERSION,
  notImplemented,
  type Project,
  parseProject,
  serializeProject,
} from "@kerf/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

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
  constructor(message: string) {
    super(message);
    this.name = "KerfFormatError";
  }
}

const PROJECT = "project.json";
const META = "meta.json";
const THUMBNAIL = "thumbnail.png";

function metaText(meta: KerfMeta): string {
  const ordered: Record<string, unknown> = {
    appVersion: meta.appVersion,
    created: meta.created,
    modified: meta.modified,
    ...(meta.planLicense === undefined ? {} : { planLicense: meta.planLicense }),
    schemaVersion: meta.schemaVersion,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function readMeta(text: string): KerfMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new KerfFormatError(`${META} is not valid JSON`);
  }
  if (typeof raw !== "object" || raw === null)
    throw new KerfFormatError(`${META} must be an object`);
  const o = raw as Record<string, unknown>;
  const text_ = (key: string): string => {
    const v = o[key];
    if (typeof v !== "string") throw new KerfFormatError(`${META}: "${key}" must be text`);
    return v;
  };
  const schemaVersion = o.schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new KerfFormatError(`${META}: "schemaVersion" must be a whole number from 1`);
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new KerfFormatError(
      `This file was saved by a newer version of Kerf (schema ${schemaVersion}).`,
    );
  }
  const meta: KerfMeta = {
    schemaVersion,
    appVersion: text_("appVersion"),
    created: text_("created"),
    modified: text_("modified"),
  };
  if (o.planLicense !== undefined) meta.planLicense = text_("planLicense");
  return meta;
}

/** Fixed timestamp (local 1980-01-01, the ZIP epoch) so output never depends on the clock. */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

/** Writes a `.kerf` archive. Throws ProjectFormatError if the project does not validate. */
export function writeKerf(project: Project, meta: KerfMeta, thumbnail?: Uint8Array): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [PROJECT]: strToU8(serializeProject(project)),
    [META]: strToU8(metaText(meta)),
  };
  if (thumbnail) entries[THUMBNAIL] = thumbnail;
  return zipSync(entries, { level: 6, mtime: ZIP_EPOCH });
}

/** Reads a `.kerf` archive, migrating the project forward. Throws KerfFormatError or ProjectFormatError. */
export function readKerf(bytes: Uint8Array): {
  project: Project;
  meta: KerfMeta;
  thumbnail?: Uint8Array;
} {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new KerfFormatError("Not a .kerf file (could not open the archive).");
  }
  const projectBytes = entries[PROJECT];
  const metaBytes = entries[META];
  if (!projectBytes) throw new KerfFormatError(`The archive has no ${PROJECT}.`);
  if (!metaBytes) throw new KerfFormatError(`The archive has no ${META}.`);

  const result: { project: Project; meta: KerfMeta; thumbnail?: Uint8Array } = {
    meta: readMeta(strFromU8(metaBytes)),
    project: parseProject(strFromU8(projectBytes)),
  };
  const thumbnail = entries[THUMBNAIL];
  if (thumbnail) result.thumbnail = thumbnail;
  return result;
}

/** .skp import spike via OpenSKP (M5). */
export function importSkp(_bytes: Uint8Array): Project {
  return notImplemented("importSkp");
}
