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
import { Viewport } from "./viewport/Viewport";
// The brand's type, bundled so Kerf works offline and calls no font host (ADR 017, D6-D7).
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/archivo/600.css";
import "./tokens.css";
import "./styles.css";

const element = document.getElementById("root");
if (!element) throw new Error("Missing #root element");
const root = createRoot(element);

/**
 * Shown when Kerf fails before its window is drawn. No project is open yet, so there is nothing to
 * download; the projects are in the browser's database, untouched by the failure.
 */
const START_FAULT =
  "Kerf couldn't start. Your projects are still in this browser. Reload the page; if this keeps " +
  "happening, please report it.";

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
      <p>{START_FAULT}</p>
    </div>,
  );
});
