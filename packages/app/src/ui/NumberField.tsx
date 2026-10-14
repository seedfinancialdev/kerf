// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A scrubby number field (Interaction spec, "Scrubby fields"): drag the label to change the value,
// click the box to type. Steps: ADR 015, rule 2. A refused value stays in the box with the reason
// under it (CODE_QUALITY rule 9), and Escape puts the shown value back. A drag let go on a refused
// value records nothing and keeps the reason, as the 3D tools do.

import { INCH, type Len, MM, type Project } from "@kerf/core";
import { type PointerEvent, useEffect, useId, useRef, useState } from "react";

/** Pixels of drag per step. */
const PIXELS_PER_STEP = 4;

/** Units per drag step: plain, with Shift, with Alt (the grid). */
const SCRUB_STEPS: Record<Project["units"], { step: Len; shift: Len; alt: Len }> = {
  imperial: { step: INCH / 16, shift: INCH, alt: INCH / 64 },
  metric: { step: MM, shift: 10 * MM, alt: MM / 100 },
};

/** What dragging the label does: the value the drag starts from, and where each step goes. */
export interface Scrub {
  value: Len;
  units: Project["units"];
  /**
   * Called with the new value (internal units) at every step of the drag; returns why that step
   * was refused, shown under the field while the drag lasts, or null.
   */
  onScrub(value: Len): string | null;
  /**
   * Called once when the pointer is released after a drag that changed the value and ended on a
   * value that was not refused.
   */
  onScrubEnd(): void;
  /**
   * Called when the drag is let go on a refused value, or the browser takes the pointer away, or
   * the field goes away, mid-drag; the drag's changes are dropped. Let go on a refused value, the
   * reason stays under the field: nothing is recorded, as with Push/Pull and Move.
   */
  onScrubCancel(): void;
}

interface Props {
  label: string;
  /** The value as shown when not editing ("36\""). */
  display: string;
  /** Takes typed text; returns the reason it was refused, or null. */
  onSubmit(text: string): string | null;
  scrub?: Scrub;
}

/** A labelled box that shows a value, takes typed text, and changes by dragging its label. */
export function NumberField({ label, display, onSubmit, scrub }: Props) {
  const id = useId();
  // What the user has typed and not yet had taken; null shows `display`. The box never holds a
  // copy of `display` itself: a copy taken while a change is being recorded would be the value
  // before it, and leaving the box would then record that old value back (found by
  // bookcase-every-step.spec.ts: a depth set with Enter went back to Default).
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? display;
  const [problem, setProblem] = useState<string | null>(null);
  // `shown`: the value shown when the drag began, which a cancelled drag shows again.
  const drag = useRef<{
    x: number;
    start: Len;
    shown: string;
    moved: boolean;
    refused: string | null;
  } | null>(null);
  // A reason kept after a drag let go on a refused value, through the value going back; armed only
  // when the value will go back, so it never outlives that release.
  const keepReason = useRef(false);
  // The latest scrub, for the clean-up below, which runs only when the field goes away.
  const latestScrub = useRef(scrub);
  useEffect(() => {
    latestScrub.current = scrub;
  });
  // A field that goes away mid-drag (a step change, say) must not leave its preview on screen.
  useEffect(
    () => () => {
      if (drag.current?.moved) latestScrub.current?.onScrubCancel();
    },
    [],
  );

  // A value changed elsewhere (Undo, another field) replaces whatever was being typed. Done while
  // rendering, as React advises for state that follows a prop, so no render shows a stale box.
  const [shownFor, setShownFor] = useState(display);
  if (shownFor !== display) {
    setShownFor(display);
    setTyped(null);
    if (keepReason.current) keepReason.current = false;
    else setProblem(null);
  }

  const submit = (): void => {
    if (typed === null || typed === display) return;
    const refusal = onSubmit(typed);
    setProblem(refusal);
    if (refusal === null) setTyped(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLLabelElement>): void => {
    if (!scrub || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      start: scrub.value,
      shown: display,
      moved: false,
      refused: null,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLLabelElement>): void => {
    const d = drag.current;
    if (!scrub || !d) return;
    const steps = Math.trunc((e.clientX - d.x) / PIXELS_PER_STEP);
    if (steps === 0 && !d.moved) return;
    d.moved = true;
    const size = SCRUB_STEPS[scrub.units];
    const unit = e.altKey ? size.alt : e.shiftKey ? size.shift : size.step;
    d.refused = scrub.onScrub(d.start + steps * unit);
    setProblem(d.refused);
  };
  const onPointerUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!scrub || !d?.moved) return;
    if (d.refused === null) {
      setProblem(null);
      scrub.onScrubEnd();
      return;
    }
    keepReason.current = display !== d.shown;
    scrub.onScrubCancel();
  };
  const onPointerCancel = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!scrub || !d?.moved) return;
    setProblem(null);
    scrub.onScrubCancel();
  };

  const messageId = `${id}-problem`;
  return (
    <div className="number-field">
      <label
        htmlFor={id}
        className={scrub ? "scrub-label" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        {label}
      </label>
      <input
        id={id}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={problem ? messageId : undefined}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setTyped(null);
            setProblem(null);
          }
        }}
      />
      {problem && (
        <p id={messageId} className="field-problem">
          {problem}
        </p>
      )}
    </div>
  );
}
