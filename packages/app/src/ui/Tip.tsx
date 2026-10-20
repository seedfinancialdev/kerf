// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One tooltip for the whole app (design spec, "Tooltips"): the control's name, its key, and one
// line on what it does. SketchUp users expect a tip on every tool; keyboard users get it on focus,
// touch users on a long press.

import {
  cloneElement,
  type PointerEvent,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** What a tip says. `key` is the shortcut, if any. */
export interface TipText {
  name: string;
  key?: string;
  text: string;
}

/** Which side of its control a tip sits on: below (the usual place), above, left or right. */
export type TipPlacement = "below" | "above" | "left" | "right";

/** How long the pointer rests before the first tip shows, in milliseconds. */
const DELAY_MS = 500;
/** A tip shown this soon after another one hid appears at once (moving along a row of tools). */
const SWEEP_MS = 300;
/** Gap between a control and its tip, and between a tip and the window's edge, in pixels. */
const GAP = 6;
const EDGE = 8;

/**
 * When any tip last hid. Module-wide on purpose: the sweep along a row of tools spans separate
 * `Tip` instances, one per control (design spec, "Tooltips").
 */
let lastHidden = Number.NEGATIVE_INFINITY;

type Trigger = ReactElement<{
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  onKeyDown?: (e: { key: string }) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLElement>) => void;
  "aria-describedby"?: string;
  ref?: React.Ref<HTMLElement>;
}>;

/** The part of a control's box a tip is placed by, in pixels from the window's top left. */
export type Box = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** Where a tip was put: its top-left corner in pixels, and the side of its control it is on. */
export interface Placed {
  left: number;
  top: number;
  side: TipPlacement;
}

/**
 * `start` (pixels), moved as little as needed for something `length` pixels long that starts there
 * to sit inside a window `span` pixels across, 8 px from either edge.
 */
export function keptInside(start: number, length: number, span: number): number {
  return Math.max(EDGE, Math.min(start, span - length - EDGE));
}

/**
 * Where a tip of size `tip` (pixels) goes beside `control`, always inside the window. Below, it
 * flips above when it would run off the bottom. Above, left or right, it goes below when that side
 * has no room. Beside the control it is level with its top, so it covers nothing in a row of
 * controls beneath; above or below it is level with its left edge.
 */
export function placeTip(
  control: Box,
  tip: Pick<DOMRect, "width" | "height">,
  placement: TipPlacement,
): Placed {
  const level = Math.min(control.top, window.innerHeight - tip.height - EDGE);
  const leftOf = control.left - GAP - tip.width;
  if (placement === "left" && leftOf >= EDGE) return { left: leftOf, top: level, side: "left" };
  const rightOf = control.right + GAP;
  if (placement === "right" && rightOf + tip.width <= window.innerWidth - EDGE) {
    return { left: rightOf, top: level, side: "right" };
  }
  const left = keptInside(control.left, tip.width, window.innerWidth);
  const above = control.top - GAP - tip.height;
  if (placement === "above" && above >= EDGE) return { left, top: above, side: "above" };
  const below = control.bottom + GAP;
  return below + tip.height > window.innerHeight
    ? { left, top: above, side: "above" }
    : { left, top: below, side: "below" };
}

/**
 * Shows `tip` for its one child control, on the side `placement` names (below unless told). Mark
 * a control that cannot be used yet `aria-disabled` rather than `disabled`: it keeps its pointer
 * events and focus, so its tip still shows (Ruling R26).
 */
export function Tip({
  tip,
  placement = "below",
  besidePanel = false,
  children,
}: {
  tip: TipText;
  placement?: TipPlacement;
  /**
   * Lines a tip placed left up with the left edge of the panel around the control (the nearest
   * element marked `data-tip-panel`), so it covers none of the panel's controls.
   */
  besidePanel?: boolean;
  children: Trigger;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const target = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Read by handlers that may run before the next render, so a quick enter and leave still records
  // `lastHidden`.
  const visible = useRef(false);
  const byTouch = useRef(false);

  const show = () => {
    visible.current = true;
    const box = target.current?.getBoundingClientRect();
    const outer = besidePanel
      ? target.current?.closest("[data-tip-panel]")?.getBoundingClientRect()
      : undefined;
    setAnchor(
      box
        ? { left: outer?.left ?? box.left, right: box.right, top: box.top, bottom: box.bottom }
        : null,
    );
    setShown(true);
  };
  const later = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(show, ms);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    if (visible.current) lastHidden = performance.now();
    visible.current = false;
    byTouch.current = false;
    setShown(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure the tip once it is on screen, so it is placed by its real size.
  useLayoutEffect(() => {
    const box = bubble.current?.getBoundingClientRect();
    if (shown && anchor && box) {
      const { left, top } = placeTip(anchor, box, placement);
      setAt({ left, top });
    }
  }, [shown, anchor, placement]);

  // A scroll or resize leaves the tip pointing at the wrong place; a touch tip also goes at the
  // next tap.
  useEffect(() => {
    if (!shown) return;
    const away = () => hide();
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    if (byTouch.current) document.addEventListener("pointerdown", away, true);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
      document.removeEventListener("pointerdown", away, true);
    };
  });

  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      target.current = el;
      const own = children.props.ref;
      if (typeof own === "function") own(el);
      else if (own) own.current = el;
    },
    "aria-describedby": shown ? id : undefined,
    onPointerEnter: (e) => {
      if (e.pointerType !== "touch") {
        if (performance.now() - lastHidden < SWEEP_MS) show();
        else later(DELAY_MS);
      }
      children.props.onPointerEnter?.(e);
    },
    onPointerLeave: (e) => {
      // A touch tip is read after the finger lifts, so only the next tap dismisses it.
      if (e.pointerType !== "touch") hide();
      children.props.onPointerLeave?.(e);
    },
    onFocus: (e) => {
      // Mouse focus follows a press, and the tip would sit over what was just pressed. `target` is
      // the focused element: a wrapper around a control has the focus inside it, not on itself.
      if (e.target instanceof Element && e.target.matches(":focus-visible")) show();
      children.props.onFocus?.(e);
    },
    onBlur: (e) => {
      hide();
      children.props.onBlur?.(e);
    },
    onKeyDown: (e) => {
      if (e.key === "Escape") hide();
      children.props.onKeyDown?.(e);
    },
    onPointerDown: (e) => {
      if (e.pointerType === "touch") {
        byTouch.current = true;
        later(DELAY_MS);
      } else hide();
      children.props.onPointerDown?.(e);
    },
    onPointerUp: (e) => {
      if (!visible.current) window.clearTimeout(timer.current);
      children.props.onPointerUp?.(e);
    },
  });

  return (
    <>
      {trigger}
      {shown && (
        <span
          ref={bubble}
          role="tooltip"
          id={id}
          className="tip"
          style={{ left: at.left, top: at.top }}
        >
          <b>{tip.name}</b>
          {tip.key && <kbd>{tip.key}</kbd>}
          <span>{tip.text}</span>
        </span>
      )}
    </>
  );
}
