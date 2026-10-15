// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One tooltip for the whole app (design spec, "Tooltips"): the control's name, its key, and one line on what
// it does. SketchUp users expect a tip on every tool; keyboard users get it on focus, touch users on a long
// press.

import { cloneElement, type ReactElement, useEffect, useId, useRef, useState } from "react";

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

let lastHidden = Number.NEGATIVE_INFINITY;

type Trigger = ReactElement<{
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: { key: string }) => void;
  onPointerDown?: (e: { pointerType: string }) => void;
  onPointerUp?: () => void;
  "aria-describedby"?: string;
  ref?: React.Ref<HTMLElement>;
}>;

/** Shows `tip` for its one child control. */
export function Tip({ tip, children }: { tip: TipText; children: Trigger }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const place = () => {
    const box = target.current?.getBoundingClientRect();
    if (box) setAt({ left: box.left, top: box.bottom + 6 });
  };
  const show = () => {
    place();
    setShown(true);
  };
  const later = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(show, ms);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    if (shown) lastHidden = performance.now();
    setShown(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      target.current = el;
      const own = children.props.ref;
      if (typeof own === "function") own(el);
      else if (own) own.current = el;
    },
    "aria-describedby": shown ? id : undefined,
    onPointerEnter: () => {
      if (performance.now() - lastHidden < SWEEP_MS) show();
      else later(DELAY_MS);
      children.props.onPointerEnter?.();
    },
    onPointerLeave: () => {
      hide();
      children.props.onPointerLeave?.();
    },
    onFocus: () => {
      show();
      children.props.onFocus?.();
    },
    onBlur: () => {
      hide();
      children.props.onBlur?.();
    },
    onKeyDown: (e) => {
      if (e.key === "Escape") hide();
      children.props.onKeyDown?.(e);
    },
    onPointerDown: (e) => {
      if (e.pointerType === "touch") later(DELAY_MS);
      children.props.onPointerDown?.(e);
    },
    onPointerUp: () => {
      if (!shown) window.clearTimeout(timer.current);
      children.props.onPointerUp?.();
    },
  });

  return (
    <>
      {trigger}
      {shown && (
        <span role="tooltip" id={id} className="tip" style={{ left: at.left, top: at.top }}>
          <b>{tip.name}</b>
          {tip.key && <kbd>{tip.key}</kbd>}
          <span>{tip.text}</span>
        </span>
      )}
    </>
  );
}
