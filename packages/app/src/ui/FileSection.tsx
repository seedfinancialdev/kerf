// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Save and Open (design spec, "Saving"). Opening is one History entry, so it can be undone.

import { useRef } from "react";
import { fileNameFor, openKerfBytes, saveKerfBytes } from "../model/files";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "./useKerf";

function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function FileSection() {
  const store = useKerfStore();
  const hasProject = useKerf((s) => s.history !== null);
  const input = useRef<HTMLInputElement>(null);

  const save = async (): Promise<void> => {
    const s = store.getState();
    const project = shownProject(s);
    if (!project) return;
    const now = new Date().toISOString();
    const thumbnail = s.thumbnail ? await s.thumbnail() : undefined;
    download(
      saveKerfBytes(project, { created: s.created ?? now, modified: now }, thumbnail),
      fileNameFor(project),
    );
  };

  const open = async (file: File): Promise<void> => {
    const r = openKerfBytes(new Uint8Array(await file.arrayBuffer()));
    if (r.ok) store.getState().begin({ label: `Opened ${file.name}`, project: r.project });
    else store.getState().say(r.message);
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
