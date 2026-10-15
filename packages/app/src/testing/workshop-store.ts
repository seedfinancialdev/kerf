// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A store already in the Workshop, for tests of the Workshop's screens: since Start left the steps
// (ADR 016), the Workshop only shows with a project open.

import { type Edit, startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import type { KerfStore } from "../model/store-types";
import { memoryLibrary } from "./memory-library";
import { memoryStorage } from "./memory-storage";

/**
 * A store in memory with `edit`'s project open in the Workshop (the bookcase by default), as one
 * History entry not kept in the library.
 */
export function workshopStore(edit: Edit = startProject("Bookcase", "imperial")): KerfStore {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  store.getState().begin(edit);
  store.getState().setScreen("workshop");
  return store;
}
