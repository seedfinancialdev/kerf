// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One card on the pegboard (design spec, §1 "Your shop"): a line drawing, a name and what the thing is
// for. Tapping hangs it, and a hung tool shows its settings on the card.

import type { ReactNode } from "react";
import { Drawing, type DrawingName } from "../art/drawings";
import { Tip, type TipText } from "../Tip";

/**
 * A card on the pegboard: a toggle button for the tool or wood, then, once hung, `children` (its
 * settings) below it. The settings sit beside the button, not in it, because a button may not hold
 * other controls.
 */
export function ToolCard({
  drawing,
  name,
  use,
  hung,
  onToggle,
  tip,
  children,
}: {
  drawing: DrawingName;
  name: string;
  use: string;
  hung: boolean;
  onToggle: () => void;
  tip: TipText;
  children?: ReactNode;
}) {
  return (
    <li className={hung ? "peg-card hung" : "peg-card"}>
      <Tip tip={tip}>
        <button type="button" className="tool-card" aria-pressed={hung} onClick={onToggle}>
          <Drawing name={drawing} className="tool-card-drawing" />
          <span className="tool-card-name">{name}</span>{" "}
          <span className="tool-card-use">{use}</span>
        </button>
      </Tip>
      {hung && children && <div className="tool-settings">{children}</div>}
    </li>
  );
}
