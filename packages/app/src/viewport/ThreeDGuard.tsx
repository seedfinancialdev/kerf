// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a failure of the 3D view inside the 3D view (silent-failure review C1). WebGL refusing to
// start, or the geometry engine failing while it draws a board, is thrown during rendering; without
// a boundary React would take the whole window down, with the cut list, the plans and Save. The
// project never depends on the picture (ADR 013, D9), so everything else keeps working. Each cause
// has its own advice in shop words; the browser's or the engine's own text goes to the console
// only, for a bug report (final fix re-review N1, N6).

import { Component, type ReactNode } from "react";
import { useKerfStore } from "../state/useKerf";

/** Said when the view itself cannot start: WebGL is off or unavailable. */
export const VIEW_NOT_STARTED =
  "The 3D view could not start in this browser. The cut list, plans and Save still work; " +
  "to see the model, turn on hardware acceleration or try another browser.";

/** Said when the geometry engine fails while drawing one board: that board is drawn plain. */
export const BOARD_NOT_DRAWN =
  "A board could not be drawn with its cuts, so it is shown plain. Everything else still works.";

/** Said when the geometry engine cannot be loaded at all: every board is drawn plain. */
export const ENGINE_NOT_LOADED =
  "The 3D view could not load what draws the cuts, so boards are shown as plain blanks. " +
  "Reload the page, or use an up-to-date browser.";

interface BoundaryProps {
  fallback: ReactNode;
  retryOn: unknown;
  onFailure(error: unknown): void;
  children: ReactNode;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onFailure(error);
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (this.state.failed && previous.retryOn !== this.props.retryOn) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Draws `children`, which use WebGL or the geometry engine. If they fail, the raw error is logged,
 * the user is warned once a session with `told`, and `fallback` (default nothing) takes their
 * place until `retryOn` changes, when they are tried again (a one-off fault does not end the view).
 */
export function ThreeDGuard({
  told,
  fallback = null,
  retryOn,
  children,
}: {
  told: string;
  fallback?: ReactNode;
  retryOn?: unknown;
  children: ReactNode;
}) {
  const store = useKerfStore();
  const failed = (error: unknown): void => {
    console.error(error);
    store.getState().warnOnce(told);
  };
  return (
    <Boundary fallback={fallback} retryOn={retryOn} onFailure={failed}>
      {children}
    </Boundary>
  );
}
