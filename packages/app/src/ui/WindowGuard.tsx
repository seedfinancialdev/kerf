// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a fault in Kerf from ending the session silently (CODE_QUALITY rule 9; ADR 015, rule 11).
// A fault while the window is drawn would leave a blank page, so the window is replaced by a few
// words and Save, which needs only the store. A fault in a click, a key or a typed size happens
// outside drawing, where no boundary sees it: React and the browser hand it to the page's `error`
// and `unhandledrejection` events, the one place every such fault reaches. There it is logged
// for a bug report, the half-done action is dropped and the user is told. The 3D view keeps its
// own guard (ThreeDGuard), so the rest of the window outlives it.

import { type ReactNode, useEffect } from "react";
import type { KerfStore } from "../model/store-types";
import { Boundary, handledByBoundary } from "../state/Boundary";
import { useKerfStore } from "../state/useKerf";
import { Notice } from "./Notice";
import { saveShownProject } from "./save";

/** Said when an action stopped half way because of a fault in Kerf. */
export const ACTION_FAULT =
  "Kerf hit a problem and could not finish what you just did. Please report it.";

/** Shown in place of the window when it cannot be drawn. */
export const WINDOW_FAULT =
  "Kerf hit a problem and can't show its window. Save a copy of your project, then reload the " +
  "page. Please report the problem.";

/** Logs `error`, drops the action it stopped and tells the user. */
function actionFailed(store: KerfStore, error: unknown): void {
  console.error(error);
  store.getState().abandonAction();
  store.getState().say(ACTION_FAULT);
}

/**
 * While mounted, every fault no handler caught is taken from the page's events: logged once here
 * (the browser's own report is stopped) and said on the notice line. An `error` event without an
 * error object comes from a script Kerf cannot see into, so it is left to the browser; one for a
 * fault a boundary already caught is left to that boundary.
 */
function useActionFaults(store: KerfStore): void {
  useEffect(() => {
    const onError = (e: ErrorEvent): void => {
      if (e.error === undefined || e.error === null) return;
      e.preventDefault();
      // A fault a boundary caught has been said and logged there (state/Boundary.tsx).
      if (handledByBoundary(e.error)) return;
      actionFailed(store, e.error);
    };
    const onRejection = (e: PromiseRejectionEvent): void => {
      e.preventDefault();
      actionFailed(store, e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [store]);
}

/** What the window becomes after a fault while drawing it: what to do, Save, and the notice. */
function WindowLost({ store }: { store: KerfStore }) {
  return (
    <div className="window-lost">
      <p>{WINDOW_FAULT}</p>
      <button type="button" onClick={() => void saveShownProject(store, new Date())}>
        Save
      </button>
      <Notice />
    </div>
  );
}

/** Draws the window, keeping any fault in Kerf, while drawing or in an action, in view. */
export function WindowGuard({ children }: { children: ReactNode }) {
  const store = useKerfStore();
  useActionFaults(store);
  return (
    <Boundary fallback={() => <WindowLost store={store} />} onFailure={(e) => console.error(e)}>
      {children}
    </Boundary>
  );
}
