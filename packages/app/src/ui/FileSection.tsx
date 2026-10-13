// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Save and Open (design spec, "Saving"). Opening is one History entry, so it can be undone.

import { useRef } from "react";
import {
  fileNameFor,
  OPEN_FAULT,
  openKerfBytes,
  SAVE_FAULT,
  saveFailureReason,
  saveKerfBytes,
} from "../model/files";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";

/** Hands the browser `bytes` as a download; the link is attached while clicked, as Firefox needs. */
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

/** Save and Open. `now` is the clock for the file's modified time (default: the real one). */
export function FileSection({ now = () => new Date() }: { now?: () => Date }) {
  const store = useKerfStore();
  const hasProject = useKerf((s) => s.history !== null);
  const input = useRef<HTMLInputElement>(null);

  const save = async (): Promise<void> => {
    const s = store.getState();
    const project = shownProject(s);
    if (!project) return;
    const stamp = now().toISOString();
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
  };

  /**
   * Reading the file can fail for reasons outside Kerf (the file was moved, the disk is gone); a
   * damaged file is refused by `openKerfBytes` in plain words. Anything else is a fault in Kerf,
   * logged for a bug report and not blamed on the file (silent-failure review I8).
   */
  const open = async (file: File): Promise<void> => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      store.getState().say("This file could not be read.");
      return;
    }
    try {
      const r = openKerfBytes(bytes);
      if (r.ok) store.getState().begin({ label: `Opened ${file.name}`, project: r.project });
      else store.getState().say(r.message);
    } catch (error) {
      console.error(error);
      store.getState().say(OPEN_FAULT);
    }
  };

  return (
    <div className="button-row">
      <button type="button" onClick={() => input.current?.click()}>
        Open…
      </button>
      <input
        ref={input}
        type="file"
        accept=".kerf"
        aria-label="Open a .kerf file"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void open(file);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => void save()} disabled={!hasProject}>
        Save
      </button>
    </div>
  );
}
