// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Downloading a project as a .kerf file (design spec, "Saving"). The open project is downloaded
// from the workshop's project menu and from the window's fallback after a fault (WindowGuard), so
// a download works even when the window cannot be drawn. Any kept project is downloaded from its
// card on Home (design spec §2, "Download .kerf file").

import type { Id } from "@kerf/core";
import { DOWNLOAD_FAULT, fileNameFor, saveFailureReason, saveKerfBytes } from "../model/files";
import { pictureInTime } from "../model/picture";
import { shownProject } from "../model/store";
import type { KeptProject, KerfStore } from "../model/store-types";

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
 * Said when a download is asked for with no project open (the window's fallback
 * offers it regardless).
 */
const NOTHING_TO_DOWNLOAD = "There is no project to download yet.";

/**
 * Downloads the shown project as a .kerf file stamped `now` (its modified time, and its created
 * time when the session has none). A failure is said on the notice line: in plain words when the
 * project or its details cannot be written, as a fault in Kerf (logged) otherwise. Never rejects.
 */
export async function saveShownProject(store: KerfStore, now: Date): Promise<void> {
  const s = store.getState();
  const project = shownProject(s);
  if (!project) {
    s.say(NOTHING_TO_DOWNLOAD);
    return;
  }
  const stamp = now.toISOString();
  // A view that cannot draw its picture, or not in time, must not stop the download: the file just
  // has no thumbnail.
  const thumbnail = await pictureInTime(s.thumbnail);
  downloadKerf(store, { project, created: s.created ?? stamp, modified: stamp, thumbnail });
}

/**
 * Downloads the kept project `id` as a .kerf file. The open project is saved as it is shown,
 * stamped `now` (`saveShownProject`); any other is saved as the library keeps it, with its own
 * times and picture, since downloading changes nothing. A project that is gone or damaged, or a
 * failure to write the file, is said on the notice line. Never rejects.
 */
export async function downloadKeptProject(store: KerfStore, id: Id, now: Date): Promise<void> {
  const s = store.getState();
  if (id === s.projectId && s.history) {
    await saveShownProject(store, now);
    return;
  }
  const kept = await s.readKeptProject(id);
  if (kept) downloadKerf(store, kept);
}

/**
 * Downloads `kept` as a .kerf file named for its project. A failure is said on the notice line: in
 * plain words when the project or its details cannot be written, as a fault in Kerf (logged)
 * otherwise.
 */
function downloadKerf(store: KerfStore, kept: KeptProject): void {
  const { project, created, modified, thumbnail } = kept;
  try {
    download(
      saveKerfBytes(project, { created, modified }, thumbnail ?? undefined),
      fileNameFor(project),
    );
  } catch (error) {
    const reason = saveFailureReason(error);
    if (reason !== undefined) {
      store.getState().say(`The file could not be downloaded: ${reason}`);
      return;
    }
    // A fault in Kerf, not in the project: the stack is what a bug report needs.
    console.error(error);
    store.getState().say(DOWNLOAD_FAULT);
  }
}
