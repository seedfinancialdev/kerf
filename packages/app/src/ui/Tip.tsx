// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One tooltip for the whole app (design spec, "Tooltips"): the control's name, its key, and one line on what
// it does. SketchUp users expect a tip on every tool; keyboard users get it on focus, touch users on a long
// press.

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

/** How long the pointer rests before the first tip shows, in milliseconds. */
const DELAY_MS = 500;
/** A tip shown within this long of another one hiding appears at once (moving along a row of tools). */
const SWEEP_MS = 300;
/** Gap between a control and its tip, and between a tip and the window's edge, in pixels. */
const GAP = 6;
const EDGE = 8;

/**
 * When any tip last hid. Module-wide on purpose: the sweep along a row of tools spans separate `Tip`
 * instances, one per control (design spec, "Tooltips").
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

/** Where a tip goes: below its control, inside the window, or above when below would run off the bottom. */
function placeTip(control: DOMRect, tip: DOMRect): { left: number; top: number } {
  const left = Math.max(EDGE, Math.min(control.left, window.innerWidth - tip.width - EDGE));
  const below = control.bottom + GAP;
  const top = below + tip.height > window.innerHeight ? control.top - GAP - tip.height : below;
  return { left, top };
}

/**
 * Shows `tip` for its one child control. A disabled control gets no pointer events from the browser, so
 * wrap it in an element that does (a span) and give that to `Tip`.
 */
export function Tip({ tip, children }: { tip: TipText; children: Trigger }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
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
    setAnchor(target.current?.getBoundingClientRect() ?? null);
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
    if (shown && anchor && box) setAt(placeTip(anchor, box));
  }, [shown, anchor]);

  // A scroll or resize leaves the tip pointing at the wrong place; a touch tip also goes at the next tap.
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
      // Mouse focus follows a press, and the tip would sit over what was just pressed.
      if (e.currentTarget.matches(":focus-visible")) show();
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
