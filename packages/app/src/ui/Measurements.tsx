// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Measurements box (Interaction spec: "the type-anywhere Measurements box work[s] the same" as
// SketchUp): typed sizes go to the active tool.

import { useEffect, useId, useRef, useState } from "react";
import type { ToolId } from "../model/store-types";
import { useKerf, useKerfStore } from "../state/useKerf";
import { handlerFor } from "../tools/pointer";
import { keptByField } from "./useShortcuts";

/**
 * The keys a typed size starts with: a digit, a minus sign, a point, a fraction bar, feet or
 * inches.
 */
const SIZE_START = /^[0-9\-./'"]$/;

/**
 * The box under the model where a size is typed for the active tool. Enter sends it and, once the
 * size is taken, hands the keyboard back to the window; a refusal is shown in plain words until the
 * text or the tool changes; Escape hands the keyboard back so tool keys work again. While the tool
 * waits for a size (it has begun an action and takes typed sizes), a size typed anywhere outside a
 * field comes here, as in SketchUp; letters are left to pick tools.
 */
export function Measurements() {
  const store = useKerfStore();
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  const tool = useKerf((s) => s.tool);
  const prompt = useKerf((s) => handlerFor(s.tool).prompt?.(s) ?? "");
  const [text, setText] = useState("");
  // A refusal belongs to the tool that gave it, so it is not shown once another tool is picked.
  const [refusal, setRefusal] = useState<{ tool: ToolId; text: string } | null>(null);
  if (refusal && refusal.tool !== tool) setRefusal(null);
  const problem = refusal?.tool === tool ? refusal.text : null;
  const problemId = `${id}-problem`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || !SIZE_START.test(e.key) || keptByField(e)) return;
      const s = store.getState();
      if (s.pending === null || !handlerFor(s.tool).measure) return;
      e.preventDefault();
      setText(e.key);
      setRefusal(null);
      box.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
  const submit = (): void => {
    if (text.trim() === "") return;
    const handler = handlerFor(tool);
    const refused = handler.measure
      ? handler.measure(text, store)
      : "This tool takes no typed size.";
    setRefusal(refused ? { tool, text: refused } : null);
    if (refused) return;
    setText("");
    // The size is in: the keyboard goes back to the window so tool keys and Ctrl/⌘+Z work again;
    // a refusal keeps it here so the size can be corrected.
    box.current?.blur();
  };
  return (
    <div className="measurements">
      <label htmlFor={id}>Measurements</label>
      <input
        ref={box}
        id={id}
        value={text}
        placeholder={prompt}
        aria-invalid={problem !== null}
        aria-describedby={problem ? problemId : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setRefusal(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
      {problem && (
        <span id={problemId} role="alert" className="field-problem">
          {problem}
        </span>
      )}
    </div>
  );
}
