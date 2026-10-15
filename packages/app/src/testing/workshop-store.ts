// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A store already in the Workshop, for tests of the Workshop's screens and tools: since Start left
// the steps (ADR 016), the Workshop only shows with a project open, and a project is opened the way
// New project opens it (`createProject`, Ruling R18). The user is a returning one who has seen the
// tour (design spec §4), so the tour stays out of the way unless a test gives its own storage.

import { type Edit, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { memoryLibrary } from "./memory-library";
import { memoryStorage } from "./memory-storage";

/** A browser's storage in memory in which the tour has been seen. */
function touredStorage(): Storage {
  const backing = memoryStorage();
  backing.setItem("kerf.toured", "yes");
  return backing;
}

/**
 * A store in memory with `edit`'s project (the bookcase by default) created and open in the
 * Workshop on Shape, as one History entry. `clockDate` is the store's clock for when it began;
 * `storage` is the browser's storage, by default one in which the tour has been seen.
 */
export async function workshopStore(
  edit: Edit = startProject("Bookcase", "imperial"),
  { clockDate, storage = touredStorage() }: { clockDate?: () => number; storage?: Storage } = {},
): Promise<KerfStore> {
  const store = createKerfStore({
    storage: createStorage(storage),
    library: memoryLibrary(),
    ...(clockDate && { clockDate }),
  });
  await store.getState().createProject(edit, "");
  return store;
}
