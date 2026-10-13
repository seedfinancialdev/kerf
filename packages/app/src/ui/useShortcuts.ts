// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Keyboard shortcuts for the whole window. Typing in a field is left alone, so Ctrl+Z there undoes
// the typing, not the project.

import { useEffect } from "react";
import { useKerfStore } from "./useKerf";

/** True when the key press is aimed at a text field, a menu or an editable area, not at the app. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

/** Ctrl/⌘+Z undoes; with Shift it redoes. */
export function useShortcuts(): void {
  const store = useKerfStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return;
      const s = store.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}
