// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A scrubby number field (Interaction spec, "Scrubby fields"): drag the label to change the value,
// click the box to type. Steps: ADR 015, rule 2. A refused value stays in the box with the reason
// under it (CODE_QUALITY rule 9), and Escape puts the shown value back.

import type { Len, Project } from "@kerf/core";
import { type PointerEvent, useEffect, useId, useRef, useState } from "react";

/** Pixels of drag per step. */
const PIXELS_PER_STEP = 4;

/** Units per drag step: plain, with Shift, with Alt (the grid). */
export const SCRUB_STEPS: Record<Project["units"], { step: Len; shift: Len; alt: Len }> = {
  imperial: { step: 12_700, shift: 203_200, alt: 3_175 },
  metric: { step: 8_000, shift: 80_000, alt: 80 },
};

/** What dragging the label does: the value the drag starts from, and where each step goes. */
export interface Scrub {
  value: Len;
  units: Project["units"];
  /** Called with the new value (internal units) at every step of the drag. */
  onScrub(value: Len): void;
  /** Called once when the pointer is released after a drag that changed the value. */
  onScrubEnd(): void;
}

interface Props {
  label: string;
  /** The value as shown when not editing ("36\""). */
  display: string;
  /** What the field holds (an expression); typing replaces it. */
  expr: string;
  /** Takes typed text; returns the reason it was refused, or null. */
  onSubmit(text: string): string | null;
  scrub?: Scrub;
}

/** A labelled box that shows a value, takes typed text, and changes by dragging its label. */
export function NumberField({ label, display, onSubmit, scrub }: Props) {
  const id = useId();
  const [text, setText] = useState(display);
  const [problem, setProblem] = useState<string | null>(null);
  const drag = useRef<{ x: number; start: Len; moved: boolean } | null>(null);

  useEffect(() => {
    setText(display);
    setProblem(null);
  }, [display]);

  const submit = (): void => {
    if (text === display) return;
    setProblem(onSubmit(text));
  };

  const onPointerDown = (e: PointerEvent<HTMLLabelElement>): void => {
    if (!scrub || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, start: scrub.value, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLLabelElement>): void => {
    const d = drag.current;
    if (!scrub || !d) return;
    const steps = Math.trunc((e.clientX - d.x) / PIXELS_PER_STEP);
    if (steps === 0 && !d.moved) return;
    d.moved = true;
    const size = SCRUB_STEPS[scrub.units];
    const unit = e.altKey ? size.alt : e.shiftKey ? size.shift : size.step;
    scrub.onScrub(d.start + steps * unit);
  };
  const onPointerUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (scrub && d?.moved) scrub.onScrubEnd();
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
      >
        {label}
      </label>
      <input
        id={id}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={problem ? messageId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setText(display);
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
