// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A fake library for tests: the real one needs a browser database. Keeps entries in a Map and
// honours `available` and `failWrites` as the real library does when the browser refuses.

import {
  isLibraryEntry,
  type Library,
  type LibraryEntry,
  newestFirst,
  summaryOf,
} from "../model/library";

/**
 * A `Library` kept in memory. Entries are copied in and out as the database does. Unavailable keeps
 * nothing; `failWrites` refuses every write and `failRemoves` every removal.
 */
export function memoryLibrary(
  options: { available?: boolean; failWrites?: boolean; failRemoves?: boolean } = {},
): Library {
  const { available = true, failWrites = false, failRemoves = false } = options;
  const entries = new Map<string, LibraryEntry>();
  return {
    available,
    list: async () =>
      available
        ? structuredClone([...entries.values()])
            .filter(isLibraryEntry)
            .map(summaryOf)
            .sort(newestFirst)
        : [],
    read: async (id) => {
      const entry = available ? structuredClone(entries.get(id)) : undefined;
      return isLibraryEntry(entry) ? entry : undefined;
    },
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
