// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A question asked in place (design spec, "Ask when it matters"): a sentence and its answers as buttons,
// inside the panel that needs the answer, never a modal over the work.

/** One answer button. */
export interface InlineAnswer {
  label: string;
  onPick: () => void;
}

/** Asks `text` in place; the first answer is the usual one and is drawn as the primary button. */
export function InlineQuestion({
  text,
  answers,
}: {
  text: string;
  answers: readonly InlineAnswer[];
}) {
  return (
    <fieldset className="ask">
      <legend>{text}</legend>
      <div className="ask-answers">
        {answers.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className={i === 0 ? "primary" : undefined}
            onClick={a.onPick}
          >
            {a.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
