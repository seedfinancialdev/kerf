// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Browser storage that never throws (ADR 015, rule 11). A private window, a full store or blocked
// site data must not stop the app; callers learn from `available` and from `write`'s result.

export type StorageKey =
  | "kerf.shop"
  | "kerf.units"
  | "kerf.theme"
  | "kerf.sections"
  | "kerf.project"
  | "kerf.created"
  | "kerf.project.setAside"
  /** A later rejected project, set aside without overwriting the earlier ones (persist.ts). */
  | `kerf.project.setAside.${number}`;

export interface AppStorage {
  /** False when the browser gives no storage at all. */
  readonly available: boolean;
  read(key: StorageKey): string | undefined;
  /** True when the value was stored. */
  write(key: StorageKey, value: string): boolean;
  remove(key: StorageKey): void;
}

/** Wraps a browser `Storage` (or its absence) so no call can throw. */
export function createStorage(backing: Storage | undefined): AppStorage {
  const attempt = <T>(fn: () => T, otherwise: T): T => {
    if (!backing) return otherwise;
    try {
      return fn();
    } catch {
      return otherwise;
    }
  };
  return {
    available: backing !== undefined,
    read: (key) => attempt(() => backing?.getItem(key) ?? undefined, undefined),
    write: (key, value) =>
      attempt(() => {
        backing?.setItem(key, value);
        return true;
      }, false),
    remove: (key) => attempt(() => backing?.removeItem(key), undefined),
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
