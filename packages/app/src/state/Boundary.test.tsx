// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A fault a boundary caught is marked as handled, so the page's error listener (ui/WindowGuard.tsx)
// does not report it a second time when a renderer also hands it to the page (R3F does).

import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { Boundary, HandOn, handledByBoundary } from "./Boundary";

const fault = new TypeError("x is undefined");
function Broken(): never {
  throw fault;
}

/** A boundary that is not Kerf's, as the 3D renderer's own one is: it shows what it caught. */
class Foreign extends Component<{ children: ReactNode }, { caught: unknown }> {
  override state = { caught: null as unknown };
  static getDerivedStateFromError(caught: unknown) {
    return { caught };
  }
  override render(): ReactNode {
    return this.state.caught === fault ? <p>caught above</p> : this.props.children;
  }
}

describe("handled faults", () => {
  let logged: MockInstance;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  it("are not marked before any boundary caught them", () => {
    expect(handledByBoundary(new TypeError("other"))).toBe(false);
  });

  it("are marked when a Boundary catches them", () => {
    const error = new RangeError("caught here");
    function Thrower(): never {
      throw error;
    }
    render(
      <Boundary fallback={() => null} onFailure={() => undefined}>
        <Thrower />
      </Boundary>,
    );
    expect(handledByBoundary(error)).toBe(true);
  });

  it("are marked by HandOn, which passes the same fault to the boundary above", () => {
    render(
      <Foreign>
        <HandOn>
          <Broken />
        </HandOn>
      </Foreign>,
    );
    expect(screen.getByText("caught above")).toBeTruthy();
    expect(handledByBoundary(fault)).toBe(true);
  });
});
