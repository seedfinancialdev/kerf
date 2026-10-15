// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps the browser's Back and Forward in step with the screen (design spec, "The flow" and "How
// it is built": "a small history-backed state is enough"). Each browser history entry names its
// screen; the address never changes, so a reload always starts where the store starts.

import { useEffect } from "react";
import type { Screen } from "../model/store-types";
import { useKerfStore } from "./useKerf";

const SCREENS: readonly Screen[] = ["shop", "home", "workshop"];

/** The screen a browser history entry names; Home for an entry Kerf did not make. */
function screenIn(state: unknown): Screen {
  const named =
    typeof state === "object" && state !== null && "screen" in state ? state.screen : undefined;
  return SCREENS.find((s) => s === named) ?? "home";
}

/**
 * While mounted, a screen change made in the app adds a browser history entry, and Back or
 * Forward sets the screen its entry names without adding one. The page's own entry is named for
 * the screen it opened on, so Back to it lands there again.
 */
export function useScreenHistory(): void {
  const store = useKerfStore();
  useEffect(() => {
    window.history.replaceState({ screen: store.getState().screen }, "");
    // True while Back or Forward sets the screen: that move is already in the browser's history.
    let following = false;
    const unsubscribe = store.subscribe((now, before) => {
      if (now.screen !== before.screen && !following) {
        window.history.pushState({ screen: now.screen }, "");
      }
    });
    const onPopState = (event: PopStateEvent): void => {
      following = true;
      try {
        store.getState().setScreen(screenIn(event.state));
      } finally {
        following = false;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, [store]);
}
