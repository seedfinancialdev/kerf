// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { browserDatabase, openLibrary } from "./model/library";
import { migrateStoredProject } from "./model/library-migration";
import { browserStorage, createStorage } from "./model/storage";
import { createKerfStore } from "./model/store";
import { WINDOW_FAULT } from "./ui/WindowGuard";
import { Viewport } from "./viewport/Viewport";
import "./tokens.css";
import "./styles.css";

const element = document.getElementById("root");
if (!element) throw new Error("Missing #root element");
const root = createRoot(element);

/**
 * Opens the library, moves in the project older Kerf kept (ADR 016, D5), and shows the app with
 * the projects listed. Inside a function because the build target may not allow a top-level await.
 */
async function start(into: Root): Promise<void> {
  const storage = createStorage(browserStorage());
  const library = await openLibrary(browserDatabase());
  const migration = await migrateStoredProject(storage, library, new Date());
  const store = createKerfStore({ storage, library, migration });
  await store.getState().refreshProjects();
  into.render(
    <StrictMode>
      <App store={store} model={<Viewport />} />
    </StrictMode>,
  );
}

start(root).catch((error: unknown) => {
  console.error(error);
  root.render(
    <div className="window-lost">
      <p>{WINDOW_FAULT}</p>
    </div>,
  );
});
