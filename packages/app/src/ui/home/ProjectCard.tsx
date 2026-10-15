// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One project on Home (design spec §2, "Recent files"): a picture of the actual model, the name and
// when it was last changed. Clicking it opens the project; its ⋯ menu renames it in place,
// duplicates, downloads or deletes it.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { editedAgo } from "../../model/edited-ago";
import type { ProjectSummary } from "../../model/library";
import { useKerfStore } from "../../state/useKerf";
import { Drawing } from "../art/drawings";
import { downloadKeptProject } from "../save";
import { ProjectMenu, type ProjectMenuActions } from "./ProjectMenu";

/** An address for the PNG `bytes` an `<img>` can show, let go when the bytes change or the card goes. */
function usePictureUrl(bytes: Uint8Array | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes]);
  return url;
}

/**
 * The name, being changed: Enter keeps it, Escape leaves it as it was, and leaving the field keeps
 * what was typed unless it is blank. A blank name is refused by the store, which says why, and the
 * field stays open.
 */
function NameField({
  name,
  keep,
  cancel,
}: {
  name: string;
  keep: (name: string) => boolean;
  cancel: () => void;
}) {
  const [text, setText] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  // Set once Enter or Escape has answered, so the blur that follows does not answer again.
  const answered = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  return (
    <input
      ref={field}
      aria-label="Name"
      className="project-rename"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && keep(text)) answered.current = true;
        if (e.key === "Escape") {
          answered.current = true;
          cancel();
        }
      }}
      onBlur={() => {
        if (answered.current) return;
        if (text.trim() === "" || text === name) cancel();
        else keep(text);
      }}
    />
  );
}

/** The card for the kept project `project`; `now` is when its "Edited …" line is counted from. */
export function ProjectCard({ project, now }: { project: ProjectSummary; now: Date }) {
  const store = useKerfStore();
  const picture = usePictureUrl(project.thumbnail);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const { id, name } = project;

  /** Renames the project to `wanted`; false when the store refused it as blank (and said so). */
  const keepName = (wanted: string): boolean => {
    // The same name again is no change, so the card does not move to the top as just edited.
    if (wanted.trim() !== name) void store.getState().renameProject(id, wanted);
    if (wanted.trim() === "") return false;
    setRenaming(false);
    return true;
  };
  const actions: ProjectMenuActions = {
    close: (refocus) => {
      setMenuOpen(false);
      if (refocus) more.current?.focus();
    },
    rename: () => {
      setMenuOpen(false);
      setRenaming(true);
    },
    duplicate: () => {
      actions.close(true);
      void store.getState().duplicateProject(id);
    },
    download: () => {
      actions.close(true);
      void downloadKeptProject(store, id, new Date());
    },
    remove: () => {
      setMenuOpen(false);
      void store.getState().deleteProject(id);
    },
  };

  const art = picture ? (
    <img className="project-picture" src={picture} alt="" />
  ) : (
    <Drawing name={project.kind} className="project-drawing" />
  );
  const edited = <span className="project-edited">Edited {editedAgo(project.modified, now)}</span>;
  const cardBody = (title: ReactNode): ReactNode => (
    <>
      <span className="project-art">{art}</span>
      <span className="project-meta">
        {title} {edited}
      </span>
    </>
  );

  return (
    <li className="project-card">
      {renaming ? (
        <div className="project-open">
          {cardBody(<NameField name={name} keep={keepName} cancel={() => setRenaming(false)} />)}
        </div>
      ) : (
        <button
          type="button"
          className="project-open"
          onClick={() => void store.getState().openProject(id)}
        >
          {cardBody(<span className="project-name">{name}</span>)}
        </button>
      )}
      <div className="card-more">
        <button
          ref={more}
          type="button"
          className="project-more"
          aria-label={`More for ${name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ⋯
        </button>
        {menuOpen && <ProjectMenu name={name} actions={actions} />}
      </div>
    </li>
  );
}
