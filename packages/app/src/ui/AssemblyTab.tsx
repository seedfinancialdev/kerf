// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Assembly order (Interaction spec, "6. The build plan", item 6; ADR 015, rule 5).

import { useKerf } from "./useKerf";

export function AssemblyTab() {
  const steps = useKerf((s) => s.solved?.assembly);
  if (!steps) return null;
  return (
    <ol className="plan-list">
      {steps.map((step) => (
        <li key={step.text} data-testid="assembly-step">
          {step.text}
        </li>
      ))}
    </ol>
  );
}
