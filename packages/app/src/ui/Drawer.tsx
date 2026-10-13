// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The build-plan drawer (Interaction spec, "Build plan drawer (bottom)"): live on every edit, and a
// banner instead of a false plan while any error exists ("The build plan never lies").

import type { DrawerTab } from "../model/store";
import { AssemblyTab } from "./AssemblyTab";
import { CutListTab } from "./CutListTab";
import { SetupsTab } from "./SetupsTab";
import { SheetsTab } from "./SheetsTab";
import { ShoppingTab } from "./ShoppingTab";
import { useKerf } from "./useKerf";

const TABS: DrawerTab[] = ["Shopping", "Cut list", "Sheets", "Setups", "Assembly"];

export function Drawer() {
  const tab = useKerf((s) => s.drawerTab);
  const setTab = useKerf((s) => s.setDrawerTab);
  const tall = useKerf((s) => s.step === "Build plan");
  const firstError = useKerf((s) =>
    s.solved?.result.diagnostics.find((d) => d.severity === "error"),
  );
  return (
    <section aria-label="Drawer" className={tall ? "drawer tall" : "drawer"}>
      <div role="tablist" className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={t === tab}
            aria-controls="drawer-panel"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {firstError && (
        <p role="alert" className="banner">
          Not ready to build: {firstError.message}
        </p>
      )}
      <div role="tabpanel" id="drawer-panel" aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab === "Shopping" && <ShoppingTab />}
        {tab === "Cut list" && <CutListTab />}
        {tab === "Sheets" && <SheetsTab />}
        {tab === "Setups" && <SetupsTab />}
        {tab === "Assembly" && <AssemblyTab />}
      </div>
    </section>
  );
}
