// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A tool's one size setting on its card (design spec, §1: the table saw's blade "standard 1/8", thin
// 3/32", other"; the dado stack's widest cut "1/2", 3/4", 13/16", other"): the usual sizes, or one typed.

import { formatLength, type Len, type Project } from "@kerf/core";
import { useId, useState } from "react";
import { ShopLengthField } from "./ShopLengthField";

/** A size the choice offers, and what it calls it. */
export interface UsualSize {
  label: string;
  size: Len;
}

const OTHER = "other";

/**
 * Chooses `value` from the `usual` sizes, or "Other", which opens a field (named `otherLabel`) for a
 * size typed in `units`. A size that is not one of the usual ones opens on "Other".
 */
export function SizeChoice({
  label,
  usual,
  value,
  units,
  otherLabel,
  notPositive,
  onChange,
}: {
  label: string;
  usual: readonly UsualSize[];
  value: Len;
  units: Project["units"];
  otherLabel: string;
  notPositive: string;
  onChange: (size: Len) => void;
}) {
  const id = useId();
  const [other, setOther] = useState(!usual.some((u) => u.size === value));
  // Only a choice made now moves the caret; a card that opens on "Other" leaves focus where it is.
  const [chose, setChose] = useState(false);
  const chosen = other ? OTHER : String(value);
  return (
    <div className="size-choice">
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={chosen}
          onChange={(e) => {
            const picked = e.target.value;
            setOther(picked === OTHER);
            setChose(picked === OTHER);
            if (picked !== OTHER) onChange(Number(picked));
          }}
        >
          {usual.map((u) => (
            <option key={u.size} value={String(u.size)}>
              {u.label}
            </option>
          ))}
          <option value={OTHER}>Other</option>
        </select>
      </div>
      {other && (
        <ShopLengthField
          label={otherLabel}
          start={formatLength(value, units)}
          units={units}
          notPositive={notPositive}
          onLength={onChange}
          readOnBlur
          focus={chose}
        />
      )}
    </div>
  );
}
