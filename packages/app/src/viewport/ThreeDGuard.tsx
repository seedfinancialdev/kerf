// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a failure of the 3D view inside the 3D view. WebGL refusing to start, or a three.js or React
// fault while a board is drawn, is thrown during rendering; without a boundary React would take
// the whole window down, with the cut list, the plans and the download. (A failure of the geometry engine
// on one board is not thrown: `meshFor` returns it, and the board is drawn plain.) The project
// never depends on the picture (ADR 013, D9), so everything else keeps working. Each cause has
// its own advice in shop words; the browser's own text goes to the console only, for a bug report.

import type { ReactNode } from "react";
import { Boundary } from "../state/Boundary";
import { useKerfStore } from "../state/useKerf";

/** Said when the view itself cannot start: WebGL is off or unavailable. */
export const VIEW_NOT_STARTED =
  "The 3D view could not start in this browser. The cut list, plans and downloading a .kerf file still work; " +
  "to see the model, turn on hardware acceleration or try another browser.";

/** Said when the view stops for a reason that is not WebGL's: a fault in Kerf. */
export const VIEW_FAULT =
  "The 3D view hit a problem and stopped. The cut list, plans and downloading a .kerf file still work; " +
  "reload the page to see the model again.";

/** Said when drawing one board fails: that board is drawn plain, the rest as usual. */
export const BOARD_FAULT =
  "A board could not be drawn, so it is shown plain. Everything else still works.";

/**
 * What to say when the whole view fails: WebGL refusing to start has its own advice; anything else
 * is a fault in Kerf, where hardware acceleration would be the wrong thing to suggest.
 */
export function viewFailure(error: unknown): string {
  return error instanceof Error && /webgl/i.test(error.message) ? VIEW_NOT_STARTED : VIEW_FAULT;
}

/** Said when the geometry engine cannot be loaded at all: every board is drawn plain. */
export const ENGINE_NOT_LOADED =
  "The 3D view could not load what draws the cuts, so boards are shown as plain blanks. " +
  "Reload the page, or use an up-to-date browser.";

/**
 * Draws `children`, which use WebGL or the geometry engine. If they fail, the raw error is logged,
 * the user is warned once a session with `told` (a sentence, or one chosen from the error), and
 * `fallback` takes their place (default nothing; with `showsTold`, the sentence itself) until
 * `retryOn` changes, when they are tried again: a one-off fault does not end the view. `onFault`
 * hears of each fault, so the owner can say which part it was after the one warning is gone.
 */
export function ThreeDGuard({
  told,
  fallback = null,
  showsTold = false,
  retryOn,
  onFault,
  children,
}: {
  told: string | ((error: unknown) => string);
  fallback?: ReactNode;
  showsTold?: boolean;
  retryOn?: unknown;
  onFault?: () => void;
  children: ReactNode;
}) {
  const store = useKerfStore();
  const words = (error: unknown): string => (typeof told === "string" ? told : told(error));
  const failed = (error: unknown): void => {
    console.error(error);
    store.getState().warnOnce(words(error));
    onFault?.();
  };
  const instead = (error: unknown): ReactNode =>
    showsTold ? <p className="model-empty">{words(error)}</p> : fallback;
  return (
    <Boundary fallback={instead} retryOn={retryOn} onFailure={failed}>
      {children}
    </Boundary>
  );
}
