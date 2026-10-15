// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One project on Home (design spec §2, "Recent files"): a picture of the actual model, the name and
// when it was last changed. Clicking it opens the project; its ⋯ menu renames it in place,
// duplicates, downloads or deletes it.

import { type ReactNode, useRef, useState } from "react";
import { editedAgo } from "../../model/edited-ago";
import type { ProjectSummary } from "../../model/library";
import { useKerfStore } from "../../state/useKerf";
import { Drawing } from "../art/drawings";
import { focusNotice } from "../Notice";
import { downloadKeptProject } from "../save";
import { NameField } from "./NameField";
import { ProjectMenu, type ProjectMenuActions } from "./ProjectMenu";
import { usePictureUrl } from "./picture-url";

/** The card for the kept project `project`; `now` is when its "Edited …" line is counted from. */
export function ProjectCard({ project, now }: { project: ProjectSummary; now: Date }) {
  const store = useKerfStore();
  const picture = usePictureUrl(project.id, project.thumbnail);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const { id, name } = project;

  /** Closes the name field and gives the keyboard back to the menu's trigger, which stays where the field was. */
  const stopRenaming = (): void => {
    setRenaming(false);
    more.current?.focus();
  };
  /** Renames the project to `wanted`; false when the store refused it as blank (and said so). */
  const keepName = (wanted: string): boolean => {
    // The same name again is no change, so the card does not move to the top as just edited.
    if (wanted.trim() !== name) void store.getState().renameProject(id, wanted);
    if (wanted.trim() === "") return false;
    stopRenaming();
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
      // The card goes; the keyboard goes to the Undo that would bring it back.
      void store.getState().deleteProject(id).then(focusNotice);
    },
  };

  const art = picture ? (
    <img className="project-picture" src={picture} alt="" />
  ) : (
    <Drawing name={project.kind} className="project-drawing" />
  );
  const edited = (
    <span className="project-edited">
      Edited {editedAgo(project.modified, now, navigator.language)}
    </span>
  );
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
          {cardBody(<NameField name={name} keep={keepName} cancel={stopRenaming} />)}
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
