// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Kerf window (Interaction spec, "Screen layout"; design spec, "Layout"). The model view is
// passed in, so the window can be drawn without WebGL in tests.

import { type ReactNode, useEffect } from "react";
import type { KerfStore } from "./model/store";
import { HintLine } from "./ui/HintLine";
import { Notice } from "./ui/Notice";
import { TopBar } from "./ui/TopBar";
import { KerfProvider, useKerf } from "./ui/useKerf";
import { useShortcuts } from "./ui/useShortcuts";

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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <div className="window">
      <TopBar />
      <HintLine />
      <Notice />
      <div className="workspace">
        <aside aria-label="Project" className="panel panel-left" />
        <main className="center">
          <section aria-label="Model" className="model">
            {model}
          </section>
        </main>
        <aside aria-label="Inspector" className="panel panel-right" />
      </div>
    </div>
  );
}
