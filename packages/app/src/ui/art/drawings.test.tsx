// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "The look": one reusable set of line drawings, decorative to screen readers.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DRAWING_NAMES, Drawing } from "./drawings";

describe("Drawing", () => {
  it.each(DRAWING_NAMES)("draws %s in the current colour, hidden from screen readers", (name) => {
    const { container } = render(<Drawing name={name} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 120 90");
  });
});
