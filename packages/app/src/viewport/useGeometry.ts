// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Loads the geometry engine for screens that draw or report on display meshes. The load is shared:
// the view and every inspector wait on the same one, and a screen that mounts later finds it
// finished, or failed, without starting another.

import { initGeometry } from "@kerf/geometry";
import { useEffect, useState } from "react";

/**
 * `load`, started on the first call and shared by every later one. The promise is kept whether it
 * succeeds or fails, so a failure is reported the same way to every caller and not retried.
 */
export function shareLoad(load: () => Promise<void>): () => Promise<void> {
  let loading: Promise<void> | undefined;
  return () => {
    loading ??= load();
    return loading;
  };
}

/**
 * The one load; its error is logged once, for a bug report, and the screens say it in shop words.
 */
const loadGeometry = shareLoad(() =>
  initGeometry().catch((error: unknown) => {
    console.error(error);
    throw error;
  }),
);

/** Whether `meshFor` may be called yet, and whether the engine failed to load. */
export function useGeometry(): { ready: boolean; failed: boolean } {
  const [state, setState] = useState({ ready: false, failed: false });
  useEffect(() => {
    let current = true;
    loadGeometry().then(
      () => current && setState({ ready: true, failed: false }),
      () => current && setState({ ready: false, failed: true }),
    );
    return () => {
      current = false;
    };
  }, []);
  return state;
}
