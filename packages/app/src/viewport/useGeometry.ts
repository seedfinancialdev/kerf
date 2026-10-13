// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Loads the geometry engine for screens that draw or report on display meshes. The load is shared:
// the view and every inspector wait on the same one, and a screen that mounts later finds it
// finished, or failed, without starting another (silent-failure review M8).

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

const loadGeometry = shareLoad(initGeometry);

/** Whether `meshFor` may be called yet, and why not if the engine could not start. */
export function useGeometry(): { ready: boolean; failure: string | null } {
  const [state, setState] = useState<{ ready: boolean; failure: string | null }>({
    ready: false,
    failure: null,
  });
  useEffect(() => {
    let current = true;
    loadGeometry().then(
      () => current && setState({ ready: true, failure: null }),
      (error: unknown) =>
        current &&
        setState({
          ready: false,
          failure: error instanceof Error ? error.message : "unknown reason",
        }),
    );
    return () => {
      current = false;
    };
  }, []);
  return state;
}
