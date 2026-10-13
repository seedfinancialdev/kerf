// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Assembly order (Interaction spec, "6. The build plan", item 6; ADR 015, rule 5).

import { NothingToShow } from "./NothingToShow";
import { useKerf } from "./useKerf";

export function AssemblyTab() {
  const steps = useKerf((s) => s.solved?.assembly);
  if (!steps) return null;
  if (steps.length === 0) return <NothingToShow />;
  return (
    <ol className="plan-list">
      {steps.map((step, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: two steps can read alike; the order is the identity.
        <li key={`${i}:${step.text}`} data-testid="assembly-step">
          {step.text}
        </li>
      ))}
    </ol>
  );
}
