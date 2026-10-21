// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Browser storage that never throws (ADR 015, rule 11). A private window, a full store, blocked
// site data or a damaged store must not stop the app; callers learn from `available`,
// `couldNotRead` and `write`'s result. A key that could not be read is never written over.

/** Every key the app keeps in browser storage. */
export type StorageKey =
  | "kerf.shop"
  | "kerf.units"
  | "kerf.theme"
  | "kerf.sections"
  | "kerf.project"
  | "kerf.created"
  /** The last New project piece and wood (last-choice.ts); its units are kerf.units. */
  | "kerf.lastChoice"
  /** "yes" once the tour has been seen or skipped. */
  | "kerf.toured"
  | "kerf.project.setAside"
  /** A later rejected project, set aside without overwriting the earlier ones (persist.ts). */
  | `kerf.project.setAside.${number}`
  /** A saved shop that could not be used, set aside before anything writes over it (shop.ts). */
  | "kerf.shop.setAside"
  | `kerf.shop.setAside.${number}`;

/** Browser storage as the app sees it: it never throws, and says when a value could not be kept. */
export interface AppStorage {
  /** False when the browser gives no storage at all. */
  readonly available: boolean;
  /** The text kept under `key`; undefined when nothing is, or it could not be read. */
  read(key: StorageKey): string | undefined;
  /**
   * True when the last read of `key` failed: whatever it holds is unknown, so it is not written
   * or removed until a read of it works, so work the app could not read is never overwritten
   * (ADR 015, rule 11).
   */
  couldNotRead(key: StorageKey): boolean;
  /** True when the value was stored; false too for a key that could not be read. */
  write(key: StorageKey, value: string): boolean;
  remove(key: StorageKey): void;
}

/** Wraps a browser `Storage` (or its absence) so no call can throw. */
export function createStorage(backing: Storage | undefined): AppStorage {
  const attempt = <T>(fn: (storage: Storage) => T, otherwise: T): T => {
    if (!backing) return otherwise;
    try {
      return fn(backing);
    } catch {
      return otherwise;
    }
  };
  // Keys whose last read threw: what they hold is unknown, so they are not written over.
  const unread = new Set<StorageKey>();
  return {
    available: backing !== undefined,
    read: (key) => {
      if (!backing) return undefined;
      try {
        const text = backing.getItem(key) ?? undefined;
        unread.delete(key);
        return text;
      } catch {
        unread.add(key);
        return undefined;
      }
    },
    couldNotRead: (key) => unread.has(key),
    write: (key, value) =>
      !unread.has(key) &&
      attempt((storage) => {
        storage.setItem(key, value);
        return true;
      }, false),
    remove: (key) => {
      if (!unread.has(key)) attempt((storage) => storage.removeItem(key), undefined);
    },
  };
}

/** The page's localStorage, or undefined where reading it throws (blocked site data). */
export function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
