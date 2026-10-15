// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Kerf window (Interaction spec, "Screen layout"; design spec, "Layout" and "The flow"): the
// screen the store is on, with the browser's Back and Forward following it. The model view is
// passed in, so the window can be drawn without WebGL in tests, and a failure inside it stays
// inside it (ThreeDGuard); any other fault in Kerf is caught and said (WindowGuard).

import { type ReactNode, useEffect } from "react";
import type { KerfStore } from "./model/store-types";
import { KerfProvider, useKerf } from "./state/useKerf";
import { useScreenHistory } from "./state/useScreenHistory";
import { Drawer } from "./ui/Drawer";
import { HintLine } from "./ui/HintLine";
import { HistoryPanel } from "./ui/HistoryPanel";
import { Home } from "./ui/home/Home";
import { Inspector } from "./ui/Inspector";
import { Notice } from "./ui/Notice";
import { ProjectTree } from "./ui/ProjectTree";
import { YourShop } from "./ui/shop/YourShop";
import { ToolRow } from "./ui/ToolRow";
import { TopBar } from "./ui/TopBar";
import { Tour } from "./ui/Tour";
import { useShortcuts } from "./ui/useShortcuts";
import { WindowGuard } from "./ui/WindowGuard";
import { ThreeDGuard, viewFailure } from "./viewport/ThreeDGuard";

/**
 * The Kerf window, on the screen `store` is on; the Workshop has the top bar, the project tree,
 * the model, the inspector and the build-plan drawer, with the tour on a first visit. `model` is the 3D view, passed in so tests
 * can leave WebGL out.
 */
export function App({ store, model }: { store: KerfStore; model: ReactNode }) {
  return (
    <KerfProvider store={store}>
      <WindowGuard>
        <Screens model={model} />
      </WindowGuard>
    </KerfProvider>
  );
}

function Screens({ model }: { model: ReactNode }) {
  useScreenHistory();
  const screen = useKerf((s) => s.screen);
  const theme = useKerf((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  if (screen === "workshop") return <Window model={model} />;
  if (screen === "shop") return <YourShop />;
  return <Home />;
}

function Window({ model }: { model: ReactNode }) {
  useShortcuts();
  // After Undo or any change the view is tried again, so a one-off fault does not end it.
  const history = useKerf((s) => s.history);
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
          <section aria-label="Model" className="model" data-tour="model">
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
      <Tour />
    </div>
  );
}
