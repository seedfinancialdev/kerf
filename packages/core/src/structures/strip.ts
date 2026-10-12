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
  // Hand-made copies of a generated board are kept: the board regenerates with the same id, so
  // the copy still points at it. Saving refuses them (see `strandedReferences`).
  const instances = project.instances.filter(
    (i) => i.generatedBy === undefined || detached.has(i.def),
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

/**
 * Hand-made objects that point at a board the form generates. They work while the form is there,
 * but the board is not in the saved file, so writing them would make a file that cannot be opened.
 * Returns where each is and what it points at.
 */
export function strandedReferences(project: Project): string[] {
  const kept = withoutGenerated(project);
  const parts = new Set(kept.parts.map((p) => p.id));
  const instances = new Set(kept.instances.map((i) => i.id));
  const placed = new Set([...instances, ...kept.patterns.map((p) => p.id)]);
  const out: string[] = [];
  for (const [i, instance] of kept.instances.entries()) {
    if (!parts.has(instance.def)) out.push(`$.instances[${i}].def`);
    if (instance.parent !== undefined && !instances.has(instance.parent)) {
      out.push(`$.instances[${i}].parent`);
    }
  }
  // Patterns are filtered out of `kept` when their source board is not saved, so look at the
  // project's own hand-made patterns.
  for (const [i, pattern] of project.patterns.entries()) {
    if (pattern.generatedBy === undefined && !instances.has(pattern.source)) {
      out.push(`$.patterns[${i}].source`);
    }
  }
  for (const [i, joint] of kept.joints.entries()) {
    for (const end of ["host", "guest"] as const) {
      if (!placed.has(joint[end])) out.push(`$.joints[${i}].${end}`);
    }
  }
  for (const [i, set] of kept.matchSets.entries()) {
    for (const [m, member] of set.members.entries()) {
      if (!instances.has(member)) out.push(`$.matchSets[${i}].members[${m}]`);
    }
  }
  return out;
}

/**
 * The generated parts that hand-made objects refer to, in the order they are first mentioned: the
 * boards a joint you added joins, a match set you made contains, a copy of one, or a pattern that
 * repeats one.
 */
export function generatedBoardsReferencedByHand(project: Project): Id[] {
  const generatedInstance = new Map(
    project.instances.filter((i) => i.generatedBy !== undefined).map((i) => [i.id, i.def]),
  );
  const generatedPattern = new Map(
    project.patterns
      .filter((p) => p.generatedBy !== undefined)
      .map((p) => [p.id, generatedInstance.get(p.source)]),
  );
  const generatedDefs = new Set(
    project.parts.filter((p) => p.source !== undefined && !p.detached).map((p) => p.id),
  );
  const found: Id[] = [];
  const note = (def: Id | undefined): void => {
    if (def !== undefined && generatedDefs.has(def) && !found.includes(def)) found.push(def);
  };
  const ref = (id: Id): void => note(generatedInstance.get(id) ?? generatedPattern.get(id));
  for (const joint of project.joints) {
    if (joint.generatedBy !== undefined) continue;
    ref(joint.host);
    ref(joint.guest);
  }
  for (const set of project.matchSets) {
    if (set.generatedBy === undefined) for (const member of set.members) ref(member);
  }
  for (const instance of project.instances) {
    if (instance.generatedBy !== undefined) continue;
    note(instance.def);
    if (instance.parent !== undefined) ref(instance.parent);
  }
  for (const pattern of project.patterns) {
    if (pattern.generatedBy === undefined) ref(pattern.source);
  }
  return found;
}
