// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Measurements box (Interaction spec: "the type-anywhere Measurements box work[s] the same" as
// SketchUp): typed sizes go to the active tool.

import { useId, useState } from "react";
import { useKerf, useKerfStore } from "../ui/useKerf";
import { handlerFor } from "./pointer";

export function Measurements() {
  const store = useKerfStore();
  const id = useId();
  const tool = useKerf((s) => s.tool);
  const prompt = useKerf((s) => handlerFor(s.tool).prompt?.(s) ?? "");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (): void => {
    const handler = handlerFor(tool);
    const refused = handler.measure
      ? handler.measure(text, store)
      : "This tool takes no typed size.";
    setProblem(refused);
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
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {problem && <span className="field-problem">{problem}</span>}
    </div>
  );
}
