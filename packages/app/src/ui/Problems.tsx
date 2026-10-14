// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The engine's problems in its own words (Interaction spec, "Feedback & errors": "the inspector
// explains it"). Each says whether it is an error or a warning in words, not by colour alone.

import type { Id } from "@kerf/core";
import { useKerf } from "../state/useKerf";

/** Every error and warning of the shown project, or only those on `parts` (part definitions). */
export function Problems({ parts }: { parts?: Set<Id> }) {
  const diagnostics = useKerf((s) => s.solved?.result.diagnostics);
  const shown = (diagnostics ?? []).filter(
    (d) => d.severity !== "info" && (!parts || (d.part !== undefined && parts.has(d.part))),
  );
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Problems" className="problems">
      {shown.map((d, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diagnostics have no id and do not reorder within one solve.
        <li key={i} className={d.severity === "error" ? "problem error" : "problem warning"}>
          {d.severity === "error" ? "Error: " : "Warning: "}
          {d.message}
          {/* A summary's words already give its number (`Diagnostic.summary`, core). */}
          {!d.summary && d.count !== undefined && d.count > 1 ? ` (${d.count} times)` : ""}
        </li>
      ))}
    </ul>
  );
}
