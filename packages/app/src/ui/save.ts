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
 * How long Save waits for the view's picture, in milliseconds. A slow or stuck canvas (software
 * WebGL, a lost context) must never hold the file back; past this the file goes without a picture.
 */
const THUMBNAIL_WAIT_MS = 1000;

/** The view's picture, or a rejection once `THUMBNAIL_WAIT_MS` has passed without one. */
function pictureInTime(take: () => Promise<Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const late = setTimeout(
      () => reject(new Error(`The 3D view gave no picture within ${THUMBNAIL_WAIT_MS} ms.`)),
      THUMBNAIL_WAIT_MS,
    );
    take().then(
      (picture) => {
        clearTimeout(late);
        resolve(picture);
      },
      (error: unknown) => {
        clearTimeout(late);
        reject(error);
      },
    );
  });
}

/** Said when Save is asked for with no project open (the File section's Save is off then). */
const NOTHING_TO_SAVE = "There is no project to save yet.";

/**
 * Downloads the shown project as a .kerf file stamped `now` (its modified time, and its created
 * time when the session has none). A failure is said on the notice line: in plain words when the
 * project or its details cannot be written, as a fault in Kerf (logged) otherwise. Never rejects.
 */
export async function saveShownProject(store: KerfStore, now: Date): Promise<void> {
  const s = store.getState();
  const project = shownProject(s);
  if (!project) {
    s.say(NOTHING_TO_SAVE);
    return;
  }
  const stamp = now.toISOString();
  // A view that cannot draw its picture, or not in time, must not stop the save: the file just has
  // no thumbnail. The failure is still logged so that files saved without pictures are noticed.
  const take = s.thumbnail;
  const thumbnail = await Promise.resolve()
    .then(() => (take ? pictureInTime(take) : undefined))
    .catch((error: unknown) => {
      console.error(error);
      return undefined;
    });
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
