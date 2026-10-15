// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// "+ Add your own" on the wood row (design spec, §1 "Your shop"): a small form for a wood the starter
// stock does not have — its name, whether it comes in sheets or boards, and its thickness.

import type { Project, Stock } from "@kerf/core";
import { type FormEvent, useId, useState } from "react";
import { newId } from "../../model/ids";
import { ownWood, type WoodKind } from "../../model/pegboard";
import { readShopLength } from "../../model/size";
import { Tip } from "../Tip";
import { TIPS } from "../tips";

const KINDS: ReadonlyArray<{ kind: WoodKind; label: string }> = [
  { kind: "sheet", label: "Sheet" },
  { kind: "board", label: "Board" },
];

/** The form, once open: `onAdd` gets the new wood; `onClose` shuts the form. */
function WoodForm({
  units,
  onAdd,
  onClose,
}: {
  units: Project["units"];
  onAdd: (stock: Stock) => void;
  onClose: () => void;
}) {
  const nameId = useId();
  const thicknessId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WoodKind>("sheet");
  const [thickness, setThickness] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const add = (e: FormEvent): void => {
    e.preventDefault();
    const read = readShopLength(thickness, units, "Thickness must be more than zero.");
    if (name.trim() === "") setProblem("Give the wood a name.");
    else if (!read.ok) setProblem(read.message);
    else {
      onAdd(ownWood(newId(), name.trim(), kind, read.value));
      onClose();
    }
  };

  return (
    <form
      className="wood-form"
      onSubmit={add}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="field">
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset className="field wood-kind">
        <legend>Comes as</legend>
        <div className="seg">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => setKind(k.kind)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={thicknessId}>Thickness</label>
        <input
          id={thicknessId}
          value={thickness}
          placeholder={units === "imperial" ? '3/4"' : "18 mm"}
          onChange={(e) => setThickness(e.target.value)}
        />
      </div>
      {problem !== null && (
        <p role="alert" className="field-problem">
          {problem}
        </p>
      )}
      <div className="wood-form-actions">
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Add
        </button>
      </div>
    </form>
  );
}

/** The last card on the wood row: a button that opens the form for a wood of your own. */
export function AddWood({
  units,
  onAdd,
}: {
  units: Project["units"];
  onAdd: (stock: Stock) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={open ? "peg-card add-wood open" : "peg-card add-wood"}>
      <Tip tip={TIPS.addWood}>
        <button
          type="button"
          className="tool-card"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="add-wood-mark" aria-hidden="true">
            +
          </span>
          <span className="tool-card-name">Add your own</span>{" "}
          <span className="tool-card-use">A sheet or board</span>
        </button>
      </Tip>
      {open && <WoodForm units={units} onAdd={onAdd} onClose={() => setOpen(false)} />}
    </li>
  );
}
