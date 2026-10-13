// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Scrubby fields": "drag a field's label left or right to change a dimension …
// click to type an exact value". Steps: ADR 015, rule 2 (1/16" per step, Shift 1", Alt 1/64").

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "./NumberField";

function field(overrides: Partial<Parameters<typeof NumberField>[0]> = {}) {
  const props = {
    label: "Width",
    display: '36"',
    expr: "36in",
    onSubmit: vi.fn(() => null),
    ...overrides,
  };
  render(<NumberField {...props} />);
  return { props, input: screen.getByLabelText("Width") as HTMLInputElement };
}

const drag = (
  label: HTMLElement,
  dx: number,
  keys: { shiftKey?: boolean; altKey?: boolean } = {},
) => {
  fireEvent.pointerDown(label, { clientX: 100, pointerId: 1, button: 0 });
  fireEvent.pointerMove(label, { clientX: 100 + dx, pointerId: 1, ...keys });
  fireEvent.pointerUp(label, { clientX: 100 + dx, pointerId: 1 });
};

describe("<NumberField>", () => {
  it("shows the snapped value until the user types", () => {
    expect(field().input.value).toBe('36"');
  });

  it("submits typed text on Enter", () => {
    const { props, input } = field();
    fireEvent.change(input, { target: { value: '30"' } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledWith('30"');
  });

  it("submits typed text when the field loses focus", () => {
    const { props, input } = field();
    fireEvent.change(input, { target: { value: '30"' } });
    fireEvent.blur(input);
    expect(props.onSubmit).toHaveBeenCalledWith('30"');
  });

  it("does not submit when nothing was changed", () => {
    const { props, input } = field();
    fireEvent.blur(input);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("keeps refused text, marks the field, and shows the reason under it", () => {
    const { input } = field({
      onSubmit: vi.fn(() => '"30" is not a length; add a unit (in, " or mm).'),
    });
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("30");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText('"30" is not a length; add a unit (in, " or mm).')).toBeTruthy();
  });

  it("puts the shown value back on Escape", () => {
    const { input } = field();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe('36"');
  });

  it('changes by 1/16" for every 4 pixels dragged', () => {
    const onScrub = vi.fn(() => null);
    field({
      scrub: {
        value: 7_315_200,
        units: "imperial",
        onScrub,
        onScrubEnd: vi.fn(),
        onScrubCancel: vi.fn(),
      },
    });
    drag(screen.getByText("Width"), 40);
    // 40 px = 10 steps × 1/16" (12700) = 127000 → 36" + 5/8".
    expect(onScrub).toHaveBeenLastCalledWith(7_442_200);
  });

  it("moves whole steps only: 7 px is one step of 4, never two", () => {
    const onScrub = vi.fn(() => null);
    field({
      scrub: {
        value: 7_315_200,
        units: "imperial",
        onScrub,
        onScrubEnd: vi.fn(),
        onScrubCancel: vi.fn(),
      },
    });
    // 7 / 4 = 1.75 steps, dropped to 1 step of 1/16" (12700); -7 px is one step the other way.
    drag(screen.getByText("Width"), 7);
    expect(onScrub).toHaveBeenLastCalledWith(7_315_200 + 12_700);
    drag(screen.getByText("Width"), -7);
    expect(onScrub).toHaveBeenLastCalledWith(7_315_200 - 12_700);
  });

  it('changes by 1" per step with Shift and by 1/64" with Alt', () => {
    const onScrub = vi.fn(() => null);
    field({
      scrub: {
        value: 7_315_200,
        units: "imperial",
        onScrub,
        onScrubEnd: vi.fn(),
        onScrubCancel: vi.fn(),
      },
    });
    drag(screen.getByText("Width"), 8, { shiftKey: true });
    expect(onScrub).toHaveBeenLastCalledWith(7_315_200 + 2 * 203_200);
    drag(screen.getByText("Width"), 8, { altKey: true });
    expect(onScrub).toHaveBeenLastCalledWith(7_315_200 + 2 * 3_175);
  });

  it("ends the drag once when the pointer is released", () => {
    const onScrubEnd = vi.fn();
    field({
      scrub: {
        value: 7_315_200,
        units: "imperial",
        onScrub: vi.fn(() => null),
        onScrubEnd,
        onScrubCancel: vi.fn(),
      },
    });
    drag(screen.getByText("Width"), 40);
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it("cancels the drag when the browser cancels the pointer", () => {
    const scrub = {
      value: 7_315_200,
      units: "imperial" as const,
      onScrub: vi.fn(() => null),
      onScrubEnd: vi.fn(),
      onScrubCancel: vi.fn(),
    };
    field({ scrub });
    const label = screen.getByText("Width");
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(label, { clientX: 140, pointerId: 1 });
    fireEvent.pointerCancel(label, { pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: 140, pointerId: 1 });
    expect(scrub.onScrubCancel).toHaveBeenCalledTimes(1);
    expect(scrub.onScrubEnd).not.toHaveBeenCalled();
  });

  it("shows the shown value again after an accepted entry that leaves it unchanged", () => {
    const { input } = field();
    fireEvent.change(input, { target: { value: '36.0"' } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe('36"');
  });
});
