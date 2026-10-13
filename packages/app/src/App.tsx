// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Kerf window (Interaction spec, "Screen layout"; design spec, "Layout"). The model view is
// passed in, so the window can be drawn without WebGL in tests, and a failure inside it stays
// inside it (ThreeDGuard).

import { type ReactNode, useEffect } from "react";
import type { KerfStore } from "./model/store-types";
import { KerfProvider, useKerf } from "./state/useKerf";
import { Drawer } from "./ui/Drawer";
import { HintLine } from "./ui/HintLine";
import { HistoryPanel } from "./ui/HistoryPanel";
import { Inspector } from "./ui/Inspector";
import { Notice } from "./ui/Notice";
import { ProjectTree } from "./ui/ProjectTree";
import { ToolRow } from "./ui/ToolRow";
import { TopBar } from "./ui/TopBar";
import { useShortcuts } from "./ui/useShortcuts";
import { ThreeDGuard, viewFailure } from "./viewport/ThreeDGuard";

/**
 * The Kerf window: the top bar, the project tree, the model, the inspector and the build-plan
 * drawer, all reading `store`. `model` is the 3D view, passed in so tests can leave WebGL out.
 */
export function App({ store, model }: { store: KerfStore; model: ReactNode }) {
  return (
    <KerfProvider store={store}>
      <Window model={model} />
    </KerfProvider>
  );
}

function Window({ model }: { model: ReactNode }) {
  useShortcuts();
  const theme = useKerf((s) => s.theme);
  // After Undo or any change the view is tried again, so a one-off fault does not end it.
  const history = useKerf((s) => s.history);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <div className="window">
      <TopBar />
      <HintLine />
      <Notice />
      <div className="workspace">
        <aside aria-label="Project" className="panel panel-left">
          <ProjectTree />
          <HistoryPanel />
        </aside>
        <main className="center">
          <section aria-label="Model" className="model">
            <ThreeDGuard told={viewFailure} showsTold retryOn={history}>
              {model}
            </ThreeDGuard>
          </section>
          <ToolRow />
          <Drawer />
        </main>
        <aside aria-label="Inspector" className="panel panel-right">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}
