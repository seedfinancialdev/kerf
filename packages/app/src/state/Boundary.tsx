// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// An error boundary: a fault thrown while part of the window is drawn is kept to that part, which
// is replaced by a fallback instead of React taking the whole page down. It is React plumbing the
// screens share, like the store's provider; the guards that use it (ThreeDGuard, WindowGuard) say
// what the user is told.

import { Component, type ReactNode } from "react";

interface BoundaryProps {
  /** What takes the children's place once they failed; given the error, for the words. */
  fallback(error: unknown): ReactNode;
  /** The children are tried again whenever this value changes. */
  retryOn?: unknown;
  /** Told of each fault caught, to log it and tell the user. */
  onFailure(error: unknown): void;
  children: ReactNode;
}

/** Draws `children`, or `fallback` once they failed while drawing, until `retryOn` changes. */
export class Boundary extends Component<BoundaryProps, { failed: { error: unknown } | null }> {
  override state: { failed: { error: unknown } | null } = { failed: null };

  static getDerivedStateFromError(error: unknown): { failed: { error: unknown } } {
    return { failed: { error } };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onFailure(error);
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (this.state.failed && previous.retryOn !== this.props.retryOn) {
      this.setState({ failed: null });
    }
  }

  override render(): ReactNode {
    const { failed } = this.state;
    return failed ? this.props.fallback(failed.error) : this.props.children;
  }
}
