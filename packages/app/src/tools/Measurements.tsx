// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Measurements box (Interaction spec: "the type-anywhere Measurements box work[s] the same" as
// SketchUp): typed sizes go to the active tool.

import { useId, useState } from "react";
import { useKerf, useKerfStore } from "../ui/useKerf";
import { handlerFor } from "./pointer";

/**
 * The box under the model where a size is typed for the active tool. Enter sends it; a refusal is
 * shown in plain words until the text or the tool changes; Escape hands the keyboard back to the
 * window so tool keys work again.
 */
export function Measurements() {
  const store = useKerfStore();
  const id = useId();
  const tool = useKerf((s) => s.tool);
  const prompt = useKerf((s) => handlerFor(s.tool).prompt?.(s) ?? "");
  const [text, setText] = useState("");
  // A refusal belongs to the tool that gave it, so it is not shown once another tool is picked.
  const [refusal, setProblem] = useState<{ tool: string; text: string } | null>(null);
  if (refusal && refusal.tool !== tool) setProblem(null);
  const problem = refusal?.tool === tool ? refusal.text : null;
  const problemId = `${id}-problem`;
  const submit = (): void => {
    if (text.trim() === "") return;
    const handler = handlerFor(tool);
    const refused = handler.measure
      ? handler.measure(text, store)
      : "This tool takes no typed size.";
    setProblem(refused ? { tool, text: refused } : null);
    if (!refused) setText("");
  };
  return (
    <div className="measurements">
      <label htmlFor={id}>Measurements</label>
      <input
        id={id}
        value={text}
        placeholder={prompt}
        aria-invalid={problem !== null}
        aria-describedby={problem ? problemId : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
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
