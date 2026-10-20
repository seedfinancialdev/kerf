// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A question asked in place (design spec, "Ask when it matters"): a sentence and its answers as
// buttons, inside the panel that needs the answer, never a modal over the work.

import type { ReactNode } from "react";

/** One answer button. */
export interface InlineAnswer {
  label: string;
  onPick: () => void;
}

/**
 * Asks `text` in place, with any `children` (a setting the answer needs) between it and the
 * answers. The first answer is the usual one and is drawn as the primary button, unless the answers
 * are `peers`.
 */
export function InlineQuestion({
  text,
  answers,
  peers = false,
  children,
}: {
  text: string;
  answers: readonly InlineAnswer[];
  peers?: boolean;
  children?: ReactNode;
}) {
  return (
    <fieldset className="ask">
      <legend>{text}</legend>
      {children}
      <div className="ask-answers">
        {answers.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className={i === 0 && !peers ? "primary" : undefined}
            onClick={a.onPick}
          >
            {a.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
