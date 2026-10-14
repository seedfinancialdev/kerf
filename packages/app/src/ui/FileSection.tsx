// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Save and Open (design spec, "Saving"). Opening is one History entry, so it can be undone.

import { useRef } from "react";
import { OPEN_FAULT, openKerfBytes } from "../model/files";
import { useKerf, useKerfStore } from "../state/useKerf";
import { saveShownProject } from "./save";

/** Save and Open. `now` is the clock for the file's modified time (default: the real one). */
export function FileSection({ now = () => new Date() }: { now?: () => Date }) {
  const store = useKerfStore();
  const hasProject = useKerf((s) => s.history !== null);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Reading the file can fail for reasons outside Kerf (the file was moved, the disk is gone); a
   * damaged file is refused by `openKerfBytes` in plain words. Anything else is a fault in Kerf,
   * logged for a bug report and not blamed on the file.
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
      <button
        type="button"
        onClick={() => void saveShownProject(store, now())}
        disabled={!hasProject}
      >
        Save
      </button>
    </div>
  );
}
