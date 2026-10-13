// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keyboard shortcuts for the whole window. Typing in a field is left alone, so Ctrl+Z there undoes
// the typing, not the project.

import { useEffect } from "react";
import { toolForKey } from "../tools/tools";
import { useKerfStore } from "./useKerf";

/** Controls that press or move with the keyboard, so Space and the arrows must reach them and not act on the model. */
const SPACE_CONTROLS =
  '[role="toolbar"], [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="option"], [role="treeitem"], button, a[href], summary';

/** True when the key press is aimed at a control that uses the key itself (a tab, a list, a button). */
function onWidget(e: KeyboardEvent): boolean {
  return e.target instanceof Element && e.target.closest(SPACE_CONTROLS) !== null;
}

/** True when the key press is aimed at a text field, a menu or an editable area, not at the app. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

/** SketchUp's red, green and blue directions: the arrow keys that lock a move to x, y or z. */
const AXIS_KEYS: Partial<Record<string, 0 | 1 | 2>> = { ArrowRight: 0, ArrowLeft: 1, ArrowUp: 2 };

/** Ctrl/⌘+Z undoes (with Shift, redoes); O and H make left-drag orbit and pan, the tool keys pick a tool, Escape goes back to Select and clears the pick, Shift+Z fits the model; while moving, the arrow keys lock the direction. */
export function useShortcuts(): void {
  const store = useKerfStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return;
      if (e.key === " " && onWidget(e)) return;
      const s = store.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const axis = AXIS_KEYS[e.key];
      if (s.tool === "move" && axis !== undefined && !onWidget(e)) {
        e.preventDefault();
        const pending = s.pending?.tool === "move" ? s.pending : null;
        // The same arrow again lets the direction go.
        const locked = pending?.axis === axis ? null : axis;
        s.setPending({
          tool: "move",
          from: [0, 0, 0],
          ray: null,
          placed: [],
          last: null,
          ...pending,
          axis: locked,
        });
        return;
      }
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === "z") s.requestFit();
      else if (key === "o") s.setNavigation("orbit");
      else if (key === "h") s.setNavigation("pan");
      else if (e.key === "Escape") {
        s.setNavigation(null);
        s.setTool("select");
        s.select({ kind: "none" });
      } else {
        const tool = toolForKey(e.key);
        if (!tool) return;
        e.preventDefault();
        s.setTool(tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}
