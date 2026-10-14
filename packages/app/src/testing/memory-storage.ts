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

/**
 * `backing` with reads of `keys` throwing, as a corrupted browser store does
 * (NS_ERROR_FILE_CORRUPTED), while `readable()` is false; writes still work.
 */
export function unreadable(
  keys: readonly string[],
  backing: Storage = memoryStorage(),
): Storage & { readable(ok: boolean): void } {
  let ok = false;
  return {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (k) => {
      if (!ok && keys.includes(k)) throw new DOMException("The store is damaged.", "UnknownError");
      return backing.getItem(k);
    },
    key: (i) => backing.key(i),
    removeItem: (k) => backing.removeItem(k),
    setItem: (k, v) => backing.setItem(k, v),
    readable: (now) => {
      ok = now;
    },
  };
}
