// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A project's menu (design spec §2, "Project card menu"): Rename, Duplicate, Download .kerf
// file and, on its Home card, Delete (which asks first; the store then offers Undo for a few
// seconds). In the workshop's top bar the menu ends with Back to Home instead of Delete.

import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import { Tip } from "../Tip";
import { TIPS } from "../tips";

/**
 * What the menu's items do; `close` shuts the menu, giving focus back to its trigger when asked.
 * An item whose action is left out is not listed: `remove` belongs to a Home card, `home` to the
 * workshop.
 */
export interface ProjectMenuActions {
  rename(): void;
  duplicate(): void;
  download(): void;
  remove?(): void;
  home?(): void;
  close(refocus: boolean): void;
}

/** Moves focus among `items` from the focused one by `step`, wrapping round at either end. */
function focusNext(items: HTMLElement[], step: number): void {
  const at = items.indexOf(document.activeElement as HTMLElement);
  items[(at + step + items.length) % items.length]?.focus();
}

/**
 * Wires the box `box` as a popup over its parent (which holds the menu's trigger too): its first button
 * takes the focus when it opens; arrow keys, Home and End move between its buttons; Escape, or a
 * press anywhere outside the parent, closes it. Returns the box's key handler.
 */
function usePopup(
  box: RefObject<HTMLDivElement | null>,
  close: (refocus: boolean) => void,
): (e: KeyboardEvent<HTMLDivElement>) => void {
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, [box]);

  useEffect(() => {
    // The parent holds the menu's trigger, whose own click toggles the popup.
    const away = (e: PointerEvent): void => {
      const holder = box.current?.parentElement;
      if (holder && e.target instanceof Node && !holder.contains(e.target)) close(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [box, close]);

  return (e) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const moves: Record<string, () => void> = {
      Escape: () => close(true),
      ArrowDown: () => focusNext(items, 1),
      ArrowUp: () => focusNext(items, -1),
      Home: () => items[0]?.focus(),
      End: () => items.at(-1)?.focus(),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };
}

/** "Delete …? You can undo this for a few seconds." with Cancel, focused first, and Delete. */
function DeleteQuestion({
  name,
  remove,
  actions,
}: {
  name: string;
  remove: () => void;
  actions: ProjectMenuActions;
}) {
  const box = useRef<HTMLDivElement>(null);
  const question = useId();
  const onKeyDown = usePopup(box, actions.close);
  return (
    <div
      ref={box}
      role="alertdialog"
      aria-labelledby={question}
      className="card-menu card-ask"
      onKeyDown={onKeyDown}
    >
      <p id={question}>Delete "{name}"? You can undo this for a few seconds.</p>
      <div className="card-ask-actions">
        <button type="button" className="quiet" onClick={() => actions.close(true)}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}

/** The menu for the project `name`, below its trigger; Delete asks before it deletes. */
export function ProjectMenu({
  name,
  actions,
  canCopy = true,
}: {
  name: string;
  actions: ProjectMenuActions;
  /** False when copies cannot be kept: Duplicate stays listed, greyed, with a tip saying why. */
  canCopy?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const onKeyDown = usePopup(box, actions.close);
  if (asking && actions.remove) {
    return <DeleteQuestion name={name} remove={actions.remove} actions={actions} />;
  }

  const items: [string, () => void][] = [
    ["Rename", actions.rename],
    ["Duplicate", actions.duplicate],
    ["Download .kerf file", actions.download],
  ];
  if (actions.remove) items.push(["Delete", () => setAsking(true)]);
  if (actions.home) items.push(["Back to Home", actions.home]);
  return (
    <div
      ref={box}
      role="menu"
      aria-label={`More for ${name}`}
      className="card-menu"
      onKeyDown={onKeyDown}
    >
      {items.map(([label, choose]) =>
        label === "Duplicate" && !canCopy ? (
          // Beside the menu, so the tip covers none of the items below Duplicate.
          <Tip key={label} tip={TIPS.copyNeedsStorage} placement="right">
            <button type="button" role="menuitem" tabIndex={-1} aria-disabled="true">
              {label}
            </button>
          </Tip>
        ) : (
          <button key={label} type="button" role="menuitem" tabIndex={-1} onClick={choose}>
            {label}
          </button>
        ),
      )}
    </div>
  );
}
