// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Open file (design spec §2 and §3): a .kerf file picked on Home or in New project is added as a
// new project and opens. Both places pick through a file chooser and hand the file over the same
// way.

import type { ChangeEvent } from "react";
import type { KerfStore } from "../model/store-types";

/** Said when the browser will not hand over the file picked. */
const UNREADABLE_FILE = "This file could not be read from your computer; try opening it again.";

/**
 * Adds the .kerf file picked in the chooser that sent `e` as a new project and opens it
 * (`addFile`, which says on the notice line why a file cannot be opened). The chooser is cleared,
 * so picking the same file again is a change too; a file the browser will not hand over is said.
 */
export async function addPickedFile(
  store: KerfStore,
  e: ChangeEvent<HTMLInputElement>,
): Promise<void> {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    store.getState().say(UNREADABLE_FILE);
    return;
  }
  await store.getState().addFile(new Uint8Array(bytes), file.name);
}
