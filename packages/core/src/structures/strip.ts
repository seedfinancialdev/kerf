// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What is saved of a project with structures: its intent. Kept apart from the generators because
// the file writer needs it and the generators need the solver, which reads the file format.

import type { Id, Project } from "../types";

/**
 * The project with everything generated and not detached removed: what is saved, and what
 * regeneration starts from. A detached part keeps its placements and the patterns repeating them.
 */
export function withoutGenerated(project: Project): Project {
  const detached = new Set(project.parts.filter((p) => p.detached).map((p) => p.id));
  const parts = project.parts.filter((p) => p.source === undefined || p.detached);
  const keptParts = new Set(parts.map((p) => p.id));
  const instances = project.instances.filter(
    (i) => keptParts.has(i.def) && (i.generatedBy === undefined || detached.has(i.def)),
  );
  const keptInstances = new Set(instances.map((i) => i.id));
  return {
    ...project,
    parts,
    instances,
    patterns: project.patterns.filter((p) => keptInstances.has(p.source)),
    joints: project.joints.filter((j) => j.generatedBy === undefined),
    matchSets: project.matchSets.filter((m) => m.generatedBy === undefined),
  };
}
