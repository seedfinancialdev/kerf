// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A length typed on the pegboard (a blade, a bit), read like every size field (model/size.ts) and
// said plainly when it cannot be used (design spec, "Number fields").

import type { Len, Project } from "@kerf/core";
import { useEffect, useId, useRef, useState } from "react";
import { readShopLength } from "../../model/size";

/**
 * A text field for one length in `units`. Enter reads it (and so does leaving the field, when
 * `readOnBlur`); a length above zero goes to `onLength`, anything else is said under the field
 * (`notPositive` for zero or less). Escape calls `onCancel`. `focus` puts the caret in it at once.
 */
export function ShopLengthField({
  label,
  start = "",
  units,
  notPositive,
  onLength,
  onCancel,
  readOnBlur = false,
  hideLabel = false,
  focus = false,
}: {
  label: string;
  start?: string;
  units: Project["units"];
  notPositive: string;
  onLength: (length: Len) => void;
  onCancel?: () => void;
  readOnBlur?: boolean;
  hideLabel?: boolean;
  focus?: boolean;
}) {
  const id = useId();
  const problemId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(start);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const read = (): void => {
    const reading = readShopLength(text, units, notPositive);
    setProblem(reading.ok ? null : reading.message);
    if (reading.ok) onLength(reading.value);
  };

  return (
    <div className="field shop-length">
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : undefined}>
        {label}
      </label>
      <input
        id={id}
        ref={input}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? undefined : problemId}
        onChange={(e) => setText(e.target.value)}
        onBlur={readOnBlur ? read : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") read();
          if (e.key === "Escape" && onCancel) {
            // Escape closes this field only, not the panel around it.
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {problem !== null && (
        <p id={problemId} className="field-problem">
          {problem}
        </p>
      )}
    </div>
  );
}
