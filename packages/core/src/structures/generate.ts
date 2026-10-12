// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Structure generation (Domain model v0, "Structures, openings & shop profile"). On every solve a
// structure emits ordinary parts, placements, patterns, joints and match sets, which then flow
// through the same pipeline as hand-made ones. Nothing here changes how a part is solved.
//
// Everything a generator makes carries its origin (`source` on parts, `generatedBy` on the rest)
// and an id derived from the structure, the part's role and the opening it sits in (ids.ts). A
// part the user has edited by hand is `detached`: it, its placements and its patterns are kept as
// saved, and the generators stop regenerating them. This file runs the generators and merges what
// they made with what the user kept; the case and the box themselves are in `case.ts` and `box.ts`.
//
// Generation is a pure function of the project and the shop: nothing is remembered between calls,
// so a project edited in place and solved again gives the answer for what it now holds.

import type { Quantity } from "../expr/evaluate";
import type { Diagnostic } from "../outputs";
import { type ProjectFormatError, validateProject } from "../project-file";
import { solveModel } from "../solve/model";
import type { Id, Instance, Joint, Project, ShopProfile, Structure } from "../types";
import { BOX_SPEC, generateBox } from "./box";
import { Builder, empty, type Generated, type PatternHosts } from "./builder";
import { CASE_SPEC, generateCase } from "./case";
import { generatedId } from "./ids";
import { withoutGenerated } from "./strip";

/**
 * What generating from a project came to: the checked project with everything its structures
 * make, or the problem with the project itself (the input, or what was generated from it).
 */
export type Generation =
  | { ok: true; project: Project; diagnostics: Diagnostic[] }
  | { ok: false; problem: ProjectFormatError };

/**
 * Checks `input`, runs the generators, and checks what they made, so nothing downstream sees an
 * invalid project.
 */
export function generateFrom(input: unknown, shop?: ShopProfile): Generation {
  const checked = validateProject(input);
  if (checked.problem) return { ok: false, problem: checked.problem };
  const made = generate(checked.project, shop);
  const whole = validateProject(made.project);
  if (whole.problem) return { ok: false, problem: whole.problem };
  return { ok: true, project: whole.project, diagnostics: made.diagnostics };
}

/** The radii of the roundover bits a shop owns: all of the shop profile that generation reads. */
function roundoverBitsOf(shop: ShopProfile | undefined): number[] {
  return (shop?.tools ?? []).flatMap((t) => (t.type === "router" ? t.roundoverBits : []));
}

/** What the generators made, with the joints each repeated shelf has (for detached copies). */
interface Made extends Generated {
  patternHosts: Map<Id, PatternHosts>;
  diagnostics: Diagnostic[];
}

/** Runs each structure's generator over the parameters of `base`. */
function runGenerators(project: Project, base: Project, shop: ShopProfile | undefined): Made {
  const made: Made = { ...empty(), patternHosts: new Map(), diagnostics: [] };
  const stocks = new Map(project.stock.map((s) => [s.id, s]));
  // Counts and sizes are read from the parameters alone, so a hand-made part that points at a
  // board the form is about to make cannot stop them being worked out.
  const parameters: Project = {
    ...base,
    parts: [],
    instances: [],
    patterns: [],
    joints: [],
    matchSets: [],
    structures: [],
  };
  const scope: Record<string, Quantity> = solveModel(parameters).scope;
  const bits = roundoverBitsOf(shop);

  for (const [index, structure] of project.structures.entries()) {
    // A second structure's boards are told apart by number so every name stays unique.
    const prefix = index === 0 ? "" : `${structure.type === "case" ? "Case" : "Box"} ${index + 1} `;
    const spec = structure.type === "case" ? CASE_SPEC : BOX_SPEC;
    const builder = new Builder(structure, spec, stocks, scope, project.units, prefix, bits);
    builder.checkOptions();
    runGenerator(structure, builder);
    made.diagnostics.push(...builder.diagnostics);
    made.parts.push(...builder.out.parts);
    made.instances.push(...builder.out.instances);
    made.patterns.push(...builder.out.patterns);
    made.joints.push(...builder.out.joints);
    made.matchSets.push(...builder.out.matchSets);
    for (const [id, hosts] of builder.patternHosts) made.patternHosts.set(id, hosts);
  }
  return made;
}

function runGenerator(structure: Structure, builder: Builder): void {
  if (structure.type === "case") generateCase(builder);
  else generateBox(builder);
}

/** A detached board the form no longer has a place for (and which is not a copy out of a row). */
function orphanWarnings(base: Project, made: Made): Diagnostic[] {
  const madeParts = new Set(made.parts.map((p) => p.id));
  // A copy detached from a pattern is a board of its own, but it still has a place in the form
  // while the pattern it came from does.
  const standsAlone = new Set(
    base.instances
      .filter((i) => i.detachedFrom && made.patterns.some((p) => p.id === i.detachedFrom?.pattern))
      .map((i) => i.def),
  );
  return base.parts
    .filter((p) => p.detached && p.source && !madeParts.has(p.id) && !standsAlone.has(p.id))
    .map((part) => ({
      severity: "warning",
      rule: "detached-board-orphaned",
      message: `${part.name} was edited by hand and the form no longer has a place for it.`,
      part: part.id,
      field: part.name,
    }));
}

/**
 * A copy taken out of a row of N shelves, when the row now has a different number. Its index no
 * longer means the same shelf, so it is left where it is and the row is made in full.
 */
function isStale(copy: Instance, made: Made): boolean {
  const from = copy.detachedFrom;
  const hosts = from && made.patternHosts.get(from.pattern);
  return from?.of !== undefined && hosts !== undefined && hosts.count !== from.of;
}

function staleCopies(base: Project, made: Made): Diagnostic[] {
  return base.instances
    .filter((copy) => isStale(copy, made))
    .map((copy) => {
      const rows = copy.detachedFrom;
      const now = rows && made.patternHosts.get(rows.pattern)?.count;
      return {
        severity: "warning" as const,
        rule: "detached-copy-stale" as const,
        message: `${copy.name ?? "A board"} was taken out of a row of ${rows?.of} shelves and the row now has ${now}. It is left where you put it and the row is made in full; put it back in the row or delete it.`,
        field: copy.name ?? "a detached board",
      };
    });
}

/** The dados a copy taken out of a shelf row keeps: the ones the form gave the row. */
function copyJoints(base: Project, made: Made): Joint[] {
  return base.instances.flatMap((copy) => {
    const hosts = copy.detachedFrom && made.patternHosts.get(copy.detachedFrom.pattern);
    const from = copy.generatedBy;
    if (!hosts || !from) return [];
    return (["left", "right"] as const).map((side) => ({
      id: generatedId(from.structure, `detachedjoint:${copy.id}:${side}`),
      type: "dado" as const,
      host: side === "left" ? hosts.left : hosts.right,
      guest: copy.id,
      params: hosts.params,
      generatedBy: from,
    }));
  });
}

/** `add` without the entries `have` already holds (kept boards win over regenerated ones). */
function fresh<T extends { id: Id }>(have: readonly T[], add: readonly T[]): T[] {
  const ids = new Set(have.map((x) => x.id));
  return add.filter((x) => !ids.has(x.id));
}

/** Joins what was kept with what was made, dropping what a detached board leaves without a place. */
function merge(
  base: Project,
  made: Made,
): {
  project: Project;
  diagnostics: Diagnostic[];
} {
  const diagnostics = [
    ...made.diagnostics,
    ...orphanWarnings(base, made),
    ...staleCopies(base, made),
  ];

  // A detached part is kept as saved; so are its placements and patterns.
  const detachedDefs = new Set(base.parts.filter((p) => p.detached).map((p) => p.id));
  const instances = [
    ...base.instances,
    ...fresh(
      base.instances,
      made.instances.filter((i) => !detachedDefs.has(i.def)),
    ),
  ];
  // Members taken out of a pattern by hand stay out when the pattern is made again.
  const skipsOf = (patternId: Id): number[] =>
    base.instances
      .filter((i) => i.detachedFrom?.pattern === patternId && !isStale(i, made))
      .flatMap((i) => (i.detachedFrom ? [i.detachedFrom.index] : []))
      .sort((a, b) => a - b);
  const instanceDef = new Map(made.instances.map((i) => [i.id, i.def]));
  const patterns = [
    ...base.patterns,
    ...fresh(
      base.patterns,
      made.patterns
        .filter((p) => !detachedDefs.has(instanceDef.get(p.source) ?? ""))
        .map((p) => {
          const skip = skipsOf(p.id);
          return skip.length > 0 ? { ...p, skip } : p;
        }),
    ),
  ];

  // A joint or match set that names a board with no placement (a detached board whose copies the
  // form no longer places) cannot be made; it is dropped and counted rather than breaking the file.
  const placed = new Set([...instances.map((i) => i.id), ...patterns.map((p) => p.id)]);
  const wantedJoints = [...made.joints, ...copyJoints(base, made)];
  const joints = wantedJoints.filter((j) => placed.has(j.host) && placed.has(j.guest));
  const matchSets = made.matchSets.filter((m) => m.members.every((id) => placed.has(id)));
  const dropped = wantedJoints.length - joints.length + (made.matchSets.length - matchSets.length);
  if (dropped > 0) {
    diagnostics.push({
      severity: "warning",
      rule: "joint-dropped",
      message: `${dropped} joint${dropped === 1 ? " was" : "s were"} not made (or grain match not kept) because a board edited by hand is not placed where the form expects it.`,
      field: "detached boards",
      count: dropped,
    });
  }
  return {
    project: {
      ...base,
      parts: [...base.parts, ...fresh(base.parts, made.parts)],
      instances,
      patterns,
      joints: [...base.joints, ...joints],
      matchSets: [...base.matchSets, ...matchSets],
    },
    diagnostics,
  };
}

/**
 * Runs the generators on a checked project. Pure: the same project always gives the same result,
 * and the project passed in is not changed.
 */
export function generate(
  project: Project,
  shop?: ShopProfile,
): { project: Project; diagnostics: Diagnostic[] } {
  const base = withoutGenerated(project);
  if (project.structures.length === 0) return { project: base, diagnostics: [] };
  return merge(base, runGenerators(project, base, shop));
}
