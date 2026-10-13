// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { browserStorage, createStorage } from "./model/storage";
import { createKerfStore } from "./model/store";
import { Viewport } from "./viewport/Viewport";
import "./tokens.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const store = createKerfStore({ storage: createStorage(browserStorage()) });

createRoot(root).render(
  <StrictMode>
    <App store={store} model={<Viewport />} />
  </StrictMode>,
);
