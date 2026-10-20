// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The top bar (design spec, "Layout"): the Kerf button (Home), the project's name and menu, the
// steps as one switcher, then Settings, Undo and Redo.

import { useEffect, useRef, useState } from "react";
import { canRedo, canUndo, currentProject } from "../model/history";
import { STEPS } from "../model/steps";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { NameField } from "./home/NameField";
import { ProjectMenu, type ProjectMenuActions } from "./home/ProjectMenu";
import { SettingsMenu } from "./SettingsMenu";
import { saveShownProject } from "./save";
import { Tip } from "./Tip";
import { stepTip, TIPS } from "./tips";

/**
 * The open project's name, which is a button opening its menu: Rename (in place), Duplicate,
 * Download .kerf file and Back to Home.
 */
function ProjectNameMenu({ name }: { name: string }) {
  const store = useKerfStore();
  const projectsKept = useKerf((s) => s.projectsKept);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  // Set when a key closed the field, so the keyboard goes back to the name button once it is shown
  // again; a field left by a click leaves the focus on what was clicked.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!renaming && returnFocus.current) button.current?.focus();
    returnFocus.current = false;
  }, [renaming]);

  const stopRenaming = (refocus: boolean): void => {
    returnFocus.current = refocus;
    setRenaming(false);
  };
  /** Renames the project to `wanted`; false when the store refused it as blank (and said so). */
  const keepName = (wanted: string, refocus: boolean): boolean => {
    const { projectId, renameProject } = store.getState();
    // The same name again is no change, so Undo is not given an empty step.
    if (projectId && wanted.trim() !== name) void renameProject(projectId, wanted);
    if (wanted.trim() === "") return false;
    stopRenaming(refocus);
    return true;
  };
  /** Makes a copy on Home and says so; the copy is not opened. */
  const duplicate = async (): Promise<void> => {
    const { projectId, duplicateProject, projects } = store.getState();
    if (!projectId) return;
    const before = new Set(projects.map((p) => p.id));
    await duplicateProject(projectId);
    const made = store.getState().projects.find((p) => !before.has(p.id));
    // The library's own words are about a project Home listed; this one is on screen.
    store
      .getState()
      .say(made ? `Made "${made.name}" on Home.` : `The copy of ${name} could not be made.`);
  };
  const actions: ProjectMenuActions = {
    close: (refocus) => {
      setMenuOpen(false);
      if (refocus) button.current?.focus();
    },
    rename: () => {
      setMenuOpen(false);
      setRenaming(true);
    },
    duplicate: () => {
      actions.close(true);
      void duplicate();
    },
    download: () => {
      actions.close(true);
      void saveShownProject(store, new Date());
    },
    home: () => {
      setMenuOpen(false);
      store.getState().setScreen("home");
    },
  };

  if (renaming) return <NameField name={name} keep={keepName} cancel={stopRenaming} />;
  return (
    <div className="project-menu-holder">
      <Tip tip={TIPS.projectMenu}>
        <button
          ref={button}
          type="button"
          className="project-name"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {name} <span aria-hidden="true">▾</span>
        </button>
      </Tip>
      {menuOpen && <ProjectMenu name={name} actions={actions} canCopy={projectsKept} />}
    </div>
  );
}

/** The Kerf button, the project's name, the steps, Settings, Undo and Redo. */
export function TopBar() {
  const setScreen = useKerf((s) => s.setScreen);
  const step = useKerf((s) => s.step);
  const setStep = useKerf((s) => s.setStep);
  const name = useKerf((s) => (s.history ? currentProject(s.history).name : null));
  const type = useKerf((s) => shownProject(s)?.structures[0]?.type);
  const undoable = useKerf((s) => s.history !== null && canUndo(s.history));
  const redoable = useKerf((s) => s.history !== null && canRedo(s.history));
  const undo = useKerf((s) => s.undo);
  const redo = useKerf((s) => s.redo);
  return (
    <header className="topbar">
      <Tip tip={TIPS.home}>
        <button type="button" className="brand" aria-label="Home" onClick={() => setScreen("home")}>
          Kerf
        </button>
      </Tip>
      {name && <ProjectNameMenu name={name} />}
      <nav aria-label="Workflow" className="steps-nav" data-tour="steps">
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s}>
              <Tip tip={stepTip(s, type)}>
                <button
                  type="button"
                  className="step"
                  aria-pressed={s === step}
                  onClick={() => setStep(s)}
                >
                  {s}
                </button>
              </Tip>
            </li>
          ))}
        </ol>
      </nav>
      <div className="topbar-actions">
        <SettingsMenu />
        {/* A disabled button gets no pointer events, so its tip hangs on the span around it. */}
        <Tip tip={TIPS.undo}>
          <span className="tip-anchor">
            <button type="button" onClick={undo} disabled={!undoable}>
              Undo
            </button>
          </span>
        </Tip>
        <Tip tip={TIPS.redo}>
          <span className="tip-anchor">
            <button type="button" onClick={redo} disabled={!redoable}>
              Redo
            </button>
          </span>
        </Tip>
      </div>
    </header>
  );
}
