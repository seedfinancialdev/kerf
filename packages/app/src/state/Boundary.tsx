// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// An error boundary: a fault thrown while part of the window is drawn is kept to that part, which
// is replaced by a fallback instead of React taking the whole page down. It is React plumbing the
// screens share, like the store's provider; the guards that use it (ThreeDGuard, WindowGuard) say
// what the user is told. Every fault a boundary here catches is marked as handled: the 3D view's
// renderer (R3F) also hands each fault a boundary caught to the page's error event, where the
// window's listener (WindowGuard) must not report it a second time as a failed action.

import { Component, type ReactNode } from "react";

/** Faults a boundary has caught; held weakly, so a fault is forgotten with the last use of it. */
const handled = new WeakSet<object>();

/** Marks `error` as caught by a boundary (render phase, before any renderer reports it). */
function markHandled(error: unknown): void {
  if (typeof error === "object" && error !== null) handled.add(error);
}

/** True when a boundary has already caught `error` and said what is to be said about it. */
export function handledByBoundary(error: unknown): boolean {
  return typeof error === "object" && error !== null && handled.has(error);
}

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
    markHandled(error);
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

/**
 * Marks a fault in `children` as handled and passes the same fault on to the boundary above. Put
 * directly inside a renderer whose own boundary reports what it catches to the page (R3F's
 * Canvas), so the boundary that says something about it (ThreeDGuard) is the only one that does.
 */
export class HandOn extends Component<
  { children: ReactNode },
  { failed: { error: unknown } | null }
> {
  override state: { failed: { error: unknown } | null } = { failed: null };

  static getDerivedStateFromError(error: unknown): { failed: { error: unknown } } {
    markHandled(error);
    return { failed: { error } };
  }

  override render(): ReactNode {
    if (this.state.failed) throw this.state.failed.error;
    return this.props.children;
  }
}
