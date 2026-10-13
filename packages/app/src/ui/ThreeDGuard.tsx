// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keeps a failure of the 3D view inside the 3D view (silent-failure review C1). WebGL refusing to
// start, or the geometry engine failing while it draws, is thrown during rendering; without a
// boundary React would take the whole window down, with the cut list, the plans and Save. The
// project never depends on the picture (ADR 013, D9), so everything else keeps working.

import { Component, type ReactNode } from "react";
import { useKerfStore } from "../state/useKerf";

/** What the user is told when the 3D view fails: why, what still works, and what to try. */
export function viewFailure(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return (
    `The 3D view could not start (${reason}). The cut list, plans and Save still work; ` +
    "to see the model, turn on hardware acceleration or try another browser."
  );
}

interface BoundaryProps {
  /** Shows the failure in place of the children; otherwise nothing is drawn there. */
  showsFailure: boolean;
  onFailure(text: string): void;
  children: ReactNode;
}

class Boundary extends Component<BoundaryProps, { failure: string | null }> {
  override state: { failure: string | null } = { failure: null };

  static getDerivedStateFromError(error: unknown): { failure: string } {
    return { failure: viewFailure(error) };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onFailure(viewFailure(error));
  }

  override render(): ReactNode {
    const { failure } = this.state;
    if (failure === null) return this.props.children;
    return this.props.showsFailure ? <p className="model-empty">{failure}</p> : null;
  }
}

/**
 * Draws `children`, which use WebGL or the geometry engine. If they fail, the user is warned once
 * on the notice line and, with `showsFailure`, the reason takes their place.
 */
export function ThreeDGuard({
  showsFailure = false,
  children,
}: {
  showsFailure?: boolean;
  children: ReactNode;
}) {
  const store = useKerfStore();
  return (
    <Boundary showsFailure={showsFailure} onFailure={(text) => store.getState().warn(text)}>
      {children}
    </Boundary>
  );
}
