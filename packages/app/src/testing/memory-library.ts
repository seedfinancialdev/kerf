// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A fake library for tests: the real one needs a browser database. Keeps entries in a Map and
// honours `available` and the failures as the real library does when the browser refuses.

import type { Project } from "@kerf/core";
import {
  isLibraryEntry,
  LIBRARY_NOT_KEPT,
  type Library,
  type LibraryEntry,
  summariesOf,
} from "../model/library";
import { pieceKinds } from "../model/piece-kind";

/**
 * A `Library` kept in memory. Entries are copied in and out as the database does. Unavailable keeps
 * nothing, for the reason `notKept` (`LIBRARY_NOT_KEPT` unless given); `failWrites` refuses every
 * write, `failRemoves` every removal, and `failReads` every list, read and look, as a database that
 * cannot be read does. `parse` reads a project's text for its kind (the engine's `parseProject`
 * unless given), so a test can make it fail.
 */
export function memoryLibrary(
  options: {
    available?: boolean;
    notKept?: string;
    failWrites?: boolean;
    failRemoves?: boolean;
    failReads?: boolean;
    parse?: (text: string) => Project;
  } = {},
): Library {
  const { available = true, failWrites = false, failRemoves = false, failReads = false } = options;
  const readable = available && !failReads;
  const kinds = pieceKinds(options.parse);
  const entries = new Map<string, LibraryEntry>();
  return {
    available,
    notKept: options.notKept ?? LIBRARY_NOT_KEPT,
    list: async () =>
      readable ? summariesOf(structuredClone([...entries.values()]), kinds) : undefined,
    read: async (id) => {
      const entry = readable ? structuredClone(entries.get(id)) : undefined;
      return isLibraryEntry(entry) ? entry : undefined;
    },
    holds: async (id) => (readable ? entries.has(id) : undefined),
    write: async (entry) => {
      if (!available || failWrites) return false;
      entries.set(entry.id, structuredClone(entry));
      return true;
    },
    remove: async (id) => {
      if (!available || failRemoves) return false;
      entries.delete(id);
      return true;
    },
  };
}
