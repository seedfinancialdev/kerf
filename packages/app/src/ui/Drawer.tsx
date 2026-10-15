// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The build-plan drawer (Interaction spec, "Build plan drawer (bottom)"): live on every edit, and a
// banner instead of a false plan while any error exists ("The build plan never lies").

import type { KeyboardEvent } from "react";
import type { DrawerTab } from "../model/store-types";
import { useKerf } from "../state/useKerf";
import { AssemblyTab } from "./AssemblyTab";
import { CutListTab } from "./CutListTab";
import { SetupsTab } from "./SetupsTab";
import { SheetsTab } from "./SheetsTab";
import { ShoppingTab } from "./ShoppingTab";
import { Tip } from "./Tip";
import { TIPS } from "./tips";

const TABS: DrawerTab[] = ["Shopping", "Cut list", "Sheets", "Setups", "Assembly"];

/** The build-plan drawer: its tabs, or the banner when an error withholds the plan. */
export function Drawer() {
  const tab = useKerf((s) => s.drawerTab);
  const setTab = useKerf((s) => s.setDrawerTab);
  const tall = useKerf((s) => s.step === "Build plan");
  const firstError = useKerf((s) =>
    s.solved?.result.diagnostics.find((d) => d.severity === "error"),
  );
  /** Arrow keys, Home and End pick the neighbouring tab and move focus to it (WAI-ARIA tabs). */
  const moveTab = (e: KeyboardEvent<HTMLButtonElement>, from: DrawerTab): void => {
    const at = TABS.indexOf(from);
    const target = {
      ArrowRight: TABS[(at + 1) % TABS.length],
      ArrowLeft: TABS[(at + TABS.length - 1) % TABS.length],
      Home: TABS[0],
      End: TABS[TABS.length - 1],
    }[e.key];
    if (!target) return;
    e.preventDefault();
    setTab(target);
    document.getElementById(`tab-${target}`)?.focus();
  };
  return (
    <section aria-label="Drawer" className={tall ? "drawer tall" : "drawer"} data-tour="drawer">
      <div role="tablist" aria-label="Plan sections" className="tabs">
        {TABS.map((t) => (
          <Tip key={t} tip={TIPS[t]}>
            <button
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={t === tab}
              aria-controls="drawer-panel"
              tabIndex={t === tab ? 0 : -1}
              onKeyDown={(e) => moveTab(e, t)}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          </Tip>
        ))}
      </div>
      {firstError && (
        <p role="alert" className="banner">
          Not ready to build: {firstError.message}
        </p>
      )}
      <div
        role="tabpanel"
        id="drawer-panel"
        aria-labelledby={`tab-${tab}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabs make the panel a tab stop so keyboard users can scroll it.
        tabIndex={0}
        className="tab-panel"
      >
        {tab === "Shopping" && <ShoppingTab />}
        {tab === "Cut list" && <CutListTab />}
        {tab === "Sheets" && <SheetsTab />}
        {tab === "Setups" && <SetupsTab />}
        {tab === "Assembly" && <AssemblyTab />}
      </div>
    </section>
  );
}
