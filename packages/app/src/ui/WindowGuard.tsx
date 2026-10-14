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

/**
 * Tells the user, logs `error` and drops the action it stopped. Telling comes first: dropping the
 * action can fail in turn (it may solve the project again), and that is logged too.
 */
function actionFailed(store: KerfStore, error: unknown): void {
  store.getState().say(ACTION_FAULT);
  console.error(error);
  try {
    store.getState().abandonAction();
  } catch (dropping) {
    console.error(dropping);
  }
}

/**
 * True the first time a fault with these words is seen for the History entry on screen: a fault
 * that repeats (one in every frame of the 3D view) is said and logged once, as `warnOnce` does,
 * and again after the next change.
 */
function firstSeen(): (store: KerfStore, error: unknown) => boolean {
  let entry: unknown = null;
  let seen = new Set<string>();
  return (store, error) => {
    const { history } = store.getState();
    if (history !== entry) {
      entry = history;
      seen = new Set();
    }
    const words = String(error);
    if (seen.has(words)) return false;
    seen.add(words);
    return true;
  };
}

/**
 * While mounted, every fault no handler caught is taken from the page's events: logged once here
 * (the browser's own report is stopped) and said on the notice line. An `error` event without an
 * error object comes from a script Kerf cannot see into, so it is left to the browser; one for a
 * fault a boundary already caught is left to that boundary.
 */
function useActionFaults(store: KerfStore): void {
  useEffect(() => {
    const isNew = firstSeen();
    const failed = (error: unknown): void => {
      if (isNew(store, error)) actionFailed(store, error);
    };
    const onError = (e: ErrorEvent): void => {
      if (e.error === undefined || e.error === null) return;
      e.preventDefault();
      // A fault a boundary caught has been said and logged there (state/Boundary.tsx).
      if (handledByBoundary(e.error)) return;
      failed(e.error);
    };
    const onRejection = (e: PromiseRejectionEvent): void => {
      e.preventDefault();
      failed(e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [store]);
}

/**
 * Logs a fault that took the window down and drops what was half done, the preview included, so
 * Save writes the recorded project: the preview is not in History, and may be what broke.
 */
function windowFailed(store: KerfStore, error: unknown): void {
  console.error(error);
  try {
    store.getState().abandonAction();
  } catch (dropping) {
    console.error(dropping);
  }
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
    <Boundary
      fallback={() => <WindowLost store={store} />}
      onFailure={(e) => windowFailed(store, e)}
    >
      {children}
    </Boundary>
  );
}
