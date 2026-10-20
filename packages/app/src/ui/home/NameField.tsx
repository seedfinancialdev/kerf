// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The field a project's name is changed in: on its Home card and in the workshop's top bar.

import { useEffect, useRef, useState } from "react";

/**
 * The name, being changed: Enter keeps it, Escape leaves it as it was, and leaving the field keeps
 * what was typed unless it is blank. A blank name is refused by the store, which says why, and the
 * field stays open. `refocus` is true when a key answered, so the caller gives the keyboard back to
 * the field's opener; a field left by a click leaves the focus on what was clicked.
 */
export function NameField({
  name,
  keep,
  cancel,
}: {
  name: string;
  keep: (name: string, refocus: boolean) => boolean;
  cancel: (refocus: boolean) => void;
}) {
  const [text, setText] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  // Set once Enter or Escape has answered, so the blur that follows does not answer again.
  const answered = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  return (
    <input
      ref={field}
      aria-label="Name"
      className="project-rename"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        // The key is used up here: the focus moves to the menu's trigger, which must not take it as a press.
        if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
        if (e.key === "Enter" && keep(text, true)) answered.current = true;
        if (e.key === "Escape") {
          answered.current = true;
          cancel(true);
        }
      }}
      onBlur={() => {
        if (answered.current) return;
        if (text.trim() === "" || text === name) cancel(false);
        else keep(text, false);
      }}
    />
  );
}
