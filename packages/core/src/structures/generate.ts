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

import type { Quantity } from "../expr/evaluate";
import type { Diagnostic } from "../outputs";
import { type ProjectFormatError, validateProject } from "../project-file";
import { solveModel } from "../solve/model";
import type { Id, Joint, Project, ShopProfile } from "../types";
import { generateBox } from "./box";
import { Builder, empty } from "./builder";
import { generateCase } from "./case";
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
 * Results already made, by the object they were made from and the bits the shop owns. A solve
 * generates on every edit; an unchanged project (the same object) is not worked out again.
 * Callers never change a project in place, so sharing the result is safe.
 */
const generatedFor = new WeakMap<object, Map<string, Generation>>();

/**
 * Checks `input`, runs the generators, and checks what they made, so nothing downstream sees an
 * invalid project. Pure and deterministic; the result for one object is made once.
 */
export function generateFrom(input: unknown, shop?: ShopProfile): Generation {
  const key = JSON.stringify(shopBits(shop));
  const memo = typeof input === "object" && input !== null ? input : undefined;
  const cached = memo && generatedFor.get(memo)?.get(key);
  if (cached) return cached;

  const checked = validateProject(input);
  let result: Generation;
  if (checked.problem) result = { ok: false, problem: checked.problem };
  else {
    const made = generate(checked.project, shop);
    const whole = validateProject(made.project);
    result = whole.problem
      ? { ok: false, problem: whole.problem }
      : { ok: true, project: whole.project, diagnostics: made.diagnostics };
  }
  if (memo) {
    const byShop = generatedFor.get(memo) ?? new Map<string, Generation>();
    byShop.set(key, result);
    generatedFor.set(memo, byShop);
  }
  return result;
}

/** The roundover bits a shop owns: all of the shop profile that generation reads. */
function shopBits(shop: ShopProfile | undefined): number[] {
  return (shop?.tools ?? []).flatMap((t) => (t.type === "router" ? t.roundoverBits : []));
}

/** Runs the generators on a checked project. Pure: the same project always gives the same result. */
export function generate(
  project: Project,
  shop?: ShopProfile,
): { project: Project; diagnostics: Diagnostic[] } {
  return work(project, shop);
}

function work(
  project: Project,
  shop?: ShopProfile,
): { project: Project; diagnostics: Diagnostic[] } {
  const base = withoutGenerated(project);
  if (project.structures.length === 0) return { project: base, diagnostics: [] };

  const stocks = new Map(project.stock.map((s) => [s.id, s]));
  const diagnostics: Diagnostic[] = [];
  const made = empty();
  const patternHosts = new Map<Id, { left: Id; right: Id; params: Record<string, string> }>();
  const roundoverBits = (shop?.tools ?? []).flatMap((t) =>
    t.type === "router" ? t.roundoverBits : [],
  );
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
  for (const [index, structure] of project.structures.entries()) {
    // A second structure's boards are told apart by number so every name stays unique.
    const prefix = index === 0 ? "" : `${structure.type === "case" ? "Case" : "Box"} ${index + 1} `;
    const builder = new Builder(structure, stocks, scope, project.units, prefix, roundoverBits);
    builder.checkOptions();
    if (structure.type === "case") generateCase(builder);
    else generateBox(builder);
    diagnostics.push(...builder.diagnostics);
    made.parts.push(...builder.out.parts);
    made.instances.push(...builder.out.instances);
    made.patterns.push(...builder.out.patterns);
    made.joints.push(...builder.out.joints);
    made.matchSets.push(...builder.out.matchSets);
    for (const [id, hosts] of builder.patternHosts) patternHosts.set(id, hosts);
  }

  const fresh = <T extends { id: Id }>(have: T[], add: T[]): T[] => {
    const ids = new Set(have.map((x) => x.id));
    return add.filter((x) => !ids.has(x.id));
  };
  // A detached part is kept as saved; so are its placements and patterns.
  const detachedDefs = new Set(base.parts.filter((p) => p.detached).map((p) => p.id));
  const madeParts = new Set(made.parts.map((p) => p.id));
  // A copy detached from a pattern is a board of its own, but it still has a place in the form
  // while the pattern it came from does.
  const standsAlone = new Set(
    base.instances
      .filter((i) => i.detachedFrom && made.patterns.some((p) => p.id === i.detachedFrom?.pattern))
      .map((i) => i.def),
  );
  for (const part of base.parts) {
    if (part.detached && part.source && !madeParts.has(part.id) && !standsAlone.has(part.id)) {
      diagnostics.push({
        severity: "warning",
        rule: "detached-board-orphaned",
        message: `${part.name} was edited by hand and the form no longer has a place for it.`,
        part: part.id,
        field: part.name,
      });
    }
  }
  const edited = new Map(made.parts.map((p) => [p.id, p]));
  for (const part of project.parts) {
    const generated = edited.get(part.id);
    if (
      generated &&
      part.source !== undefined &&
      !part.detached &&
      (part.length !== generated.length ||
        part.width !== generated.width ||
        part.thickness !== generated.thickness)
    ) {
      diagnostics.push({
        severity: "warning",
        rule: "generated-part-edited",
        message: `${part.name} was changed by hand, but the form still controls it; detach it to keep the change.`,
        part: part.id,
        field: part.name,
      });
    }
  }

  const generatedInstances = made.instances.filter((i) => !detachedDefs.has(i.def));
  // Members taken out of a pattern by hand stay out when the pattern is made again.
  const skipsOf = (patternId: Id): number[] =>
    base.instances
      .filter((i) => i.detachedFrom?.pattern === patternId)
      .map((i) => i.detachedFrom?.index ?? 0)
      .sort((a, b) => a - b);
  const generatedPatterns = made.patterns
    .filter((p) => !detachedDefs.has(made.instances.find((i) => i.id === p.source)?.def ?? ""))
    .map((p) => {
      const skip = skipsOf(p.id);
      return skip.length > 0 ? { ...p, skip } : p;
    });
  // Each detached copy keeps the joints the form gave the pattern.
  const copyJoints: Joint[] = base.instances.flatMap((copy) => {
    const hosts = copy.detachedFrom && patternHosts.get(copy.detachedFrom.pattern);
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
  const instances = [...base.instances, ...fresh(base.instances, generatedInstances)];
  const patterns = [...base.patterns, ...fresh(base.patterns, generatedPatterns)];
  const placed = new Set([...instances.map((i) => i.id), ...patterns.map((p) => p.id)]);
  // A joint or match set that names a board with no placement (a detached board whose copies the
  // form no longer places) cannot be made; it is dropped and counted rather than breaking the file.
  const joints = [...made.joints, ...copyJoints].filter(
    (j) => placed.has(j.host) && placed.has(j.guest),
  );
  const matchSets = made.matchSets.filter((m) => m.members.every((id) => placed.has(id)));
  const dropped =
    made.joints.length +
    copyJoints.length -
    joints.length +
    (made.matchSets.length - matchSets.length);
  if (dropped > 0) {
    diagnostics.push({
      severity: "warning",
      rule: "joint-dropped",
      message: `${dropped} joint${dropped === 1 ? " was" : "s were"} not made because a board edited by hand is not placed where the form expects it.`,
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
