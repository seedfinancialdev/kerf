// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A fake library for tests: the real one needs a browser database. Keeps entries in a Map and
// honours `available` and `failWrites` as the real library does when the browser refuses.

import { type Library, type LibraryEntry, newestFirst, summaryOf } from "../model/library";

/** A `Library` kept in memory; unavailable keeps nothing, `failWrites` refuses every write. */
export function memoryLibrary(
  options: { available?: boolean; failWrites?: boolean } = {},
): Library {
  const { available = true, failWrites = false } = options;
  const entries = new Map<string, LibraryEntry>();
  return {
    available,
    list: async () => [...entries.values()].map(summaryOf).sort(newestFirst),
    read: async (id) => entries.get(id),
    write: async (entry) => {
      if (!available || failWrites) return false;
      entries.set(entry.id, entry);
      return true;
    },
    remove: async (id) => {
      if (!available) return false;
      entries.delete(id);
      return true;
    },
  };
}
