// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Saving the shown project as a .kerf download (design spec, "Saving"), shared by the File section
// and the window's fallback after a fault (WindowGuard), so Save works even when the window cannot.

import { fileNameFor, SAVE_FAULT, saveFailureReason, saveKerfBytes } from "../model/files";
import { shownProject } from "../model/store";
import type { KerfStore } from "../model/store-types";

/**
 * Hands the browser `bytes` as a download; the link is attached while clicked, as Firefox needs.
 */
function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Downloads the shown project as a .kerf file stamped `now` (its modified time, and its created
 * time when the session has none). A failure is said on the notice line: in plain words when the
 * project or its details cannot be written, as a fault in Kerf (logged) otherwise. Never rejects.
 */
export async function saveShownProject(store: KerfStore, now: Date): Promise<void> {
  const s = store.getState();
  const project = shownProject(s);
  if (!project) return;
  const stamp = now.toISOString();
  // A view that cannot draw its picture must not stop the save: the file just has no thumbnail.
  const thumbnail = await Promise.resolve()
    .then(() => s.thumbnail?.())
    .catch(() => undefined);
  try {
    download(
      saveKerfBytes(project, { created: s.created ?? stamp, modified: stamp }, thumbnail),
      fileNameFor(project),
    );
  } catch (error) {
    const reason = saveFailureReason(error);
    if (reason !== undefined) {
      s.say(`The file could not be saved: ${reason}`);
      return;
    }
    // A fault in Kerf, not in the project: the stack is what a bug report needs.
    console.error(error);
    s.say(SAVE_FAULT);
  }
}
