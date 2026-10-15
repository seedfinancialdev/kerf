// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Settings in the top bar: Your shop (design spec, §1: "reached later from Settings"), the theme (a
// browser preference) and the units. Units are both the
// preference for new projects and, when the open project's stock fits the new grid, that project's
// own field, so the change is an undoable History entry (ADR 015, rule 4).

import type { Project } from "@kerf/core";
import { useEffect, useState } from "react";
import { switchUnits } from "../model/commands";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { Tip } from "./Tip";
import { TIPS } from "./tips";

const UNITS_NAME = { imperial: "inches", metric: "millimetres" } as const;

/** Your shop, theme and units. */
export function SettingsMenu() {
  const store = useKerfStore();
  const [open, setOpen] = useState(false);
  const forNew = useKerf((s) => s.unitsForNew);
  const theme = useKerf((s) => s.theme);
  const projectUnits = useKerf((s) => shownProject(s)?.units);
  const units = projectUnits ?? forNew;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const chooseUnits = (chosen: Project["units"]): void => {
    const state = store.getState();
    state.setUnitsForNew(chosen);
    const project = shownProject(state);
    if (!project || project.units === chosen) return;
    const result = switchUnits(project, chosen);
    if (result.ok) state.apply(result.edit);
    else state.say(`New projects will use ${UNITS_NAME[chosen]}. ${result.message}`);
  };

  return (
    <div className="settings">
      <Tip tip={TIPS.settings}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          Settings
        </button>
      </Tip>
      {open && (
        <div className="settings-panel">
          <button type="button" onClick={() => store.getState().setScreen("shop")}>
            Your shop
          </button>
          <fieldset>
            <legend>Theme</legend>
            <label className="check">
              <input
                type="radio"
                name="theme"
                checked={theme === "dark"}
                onChange={() => store.getState().setTheme("dark")}
              />
              Dark
            </label>
            <label className="check">
              <input
                type="radio"
                name="theme"
                checked={theme === "light"}
                onChange={() => store.getState().setTheme("light")}
              />
              Light
            </label>
          </fieldset>
          <fieldset>
            <legend>Units</legend>
            <label className="check">
              <input
                type="radio"
                name="units"
                checked={units === "imperial"}
                onChange={() => chooseUnits("imperial")}
              />
              Inches
            </label>
            <label className="check">
              <input
                type="radio"
                name="units"
                checked={units === "metric"}
                onChange={() => chooseUnits("metric")}
              />
              Millimetres
            </label>
          </fieldset>
        </div>
      )}
    </div>
  );
}
