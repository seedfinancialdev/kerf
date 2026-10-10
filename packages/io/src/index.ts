// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { notImplemented, type Project } from "@kerf/core";

export interface KerfMeta {
  schemaVersion: number;
  appVersion: string;
  created: string;
  modified: string;
  planLicense?: string;
}

/** `.kerf`: a zip with project.json, meta.json and thumbnail.png (M1). */
export function readKerf(_bytes: Uint8Array): { project: Project; meta: KerfMeta } {
  return notImplemented("readKerf");
}

export function writeKerf(_project: Project, _meta: KerfMeta): Uint8Array {
  return notImplemented("writeKerf");
}

/** .skp import spike via OpenSKP (M5). */
export function importSkp(_bytes: Uint8Array): Project {
  return notImplemented("importSkp");
}
