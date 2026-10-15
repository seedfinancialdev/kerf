// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A store already in the Workshop, for tests of the Workshop's screens and tools: since Start left
// the steps (ADR 016), the Workshop only shows with a project open, and a project is opened the way
// New project opens it (`createProject`, Ruling R18).

import { type Edit, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { memoryLibrary } from "./memory-library";
import { memoryStorage } from "./memory-storage";

/**
 * A store in memory with `edit`'s project (the bookcase by default) created and open in the
 * Workshop on Shape, as one History entry; `clockDate` is the store's clock for when it began.
 */
export async function workshopStore(
  edit: Edit = startProject("Bookcase", "imperial"),
  clockDate?: () => number,
): Promise<KerfStore> {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
    ...(clockDate && { clockDate }),
  });
  await store.getState().createProject(edit, "");
  return store;
}
