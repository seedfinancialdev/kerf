// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// An in-memory browser Storage for tests (a real one needs a browser). `failWrites` behaves like a
// full store, which throws QuotaExceededError on write.

/** A `Storage` kept in memory; with `failWrites`, every write throws as a full store does. */
export function memoryStorage(failWrites = false): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      if (failWrites) throw new DOMException("The store is full.", "QuotaExceededError");
      map.set(k, v);
    },
  };
}
