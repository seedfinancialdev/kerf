// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Loads the geometry engine for screens that draw or report on display meshes. Loading is shared
// and happens once; a screen that mounts later finds it ready.

import { initGeometry } from "@kerf/geometry";
import { useEffect, useState } from "react";

/** Whether `meshFor` may be called yet, and why not if the engine could not start. */
export function useGeometry(): { ready: boolean; failure: string | null } {
  const [state, setState] = useState<{ ready: boolean; failure: string | null }>({
    ready: false,
    failure: null,
  });
  useEffect(() => {
    let current = true;
    initGeometry().then(
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
