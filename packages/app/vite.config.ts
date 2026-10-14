// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // manifold-3d loads its .wasm next to its own script, so it must not be pre-bundled.
  optimizeDeps: { exclude: ["manifold-3d"] },
  server: { port: 5173, strictPort: true },
});
