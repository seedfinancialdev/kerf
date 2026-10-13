// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The top bar (design spec, "Layout"): the five steps as one switcher, then Settings, Undo and Redo.

import { canRedo, canUndo, currentProject } from "../model/history";
import { STEPS } from "../model/steps";
import { useKerf } from "../state/useKerf";
import { SettingsMenu } from "./SettingsMenu";

export function TopBar() {
  const step = useKerf((s) => s.step);
  const setStep = useKerf((s) => s.setStep);
  const name = useKerf((s) => (s.history ? currentProject(s.history).name : null));
  const undoable = useKerf((s) => s.history !== null && canUndo(s.history));
  const redoable = useKerf((s) => s.history !== null && canRedo(s.history));
  const undo = useKerf((s) => s.undo);
  const redo = useKerf((s) => s.redo);
  return (
    <header className="topbar">
      <span className="brand">Kerf</span>
      {name && <span className="project-name">{name}</span>}
      <nav aria-label="Workflow" className="steps-nav">
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="step"
                aria-pressed={s === step}
                onClick={() => setStep(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="topbar-actions">
        <SettingsMenu />
        <button type="button" onClick={undo} disabled={!undoable}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!redoable}>
          Redo
        </button>
      </div>
    </header>
  );
}
