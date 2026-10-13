// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The project tree (Interaction spec, "Project tree (left)"): structures, their openings, then the
// boards with counts, each with how many problems the engine reported on it.

import type { Id, Opening, PlacedPart, Project, SolveResult, Structure } from "@kerf/core";
import { readCount } from "./size";

export type TreeRow =
  | { kind: "structure"; key: string; depth: 0; label: string; structure: Id; problems: number }
  | {
      kind: "opening";
      key: string;
      depth: number;
      label: string;
      structure: Id;
      opening: Id;
      problems: number;
    }
  | {
      kind: "group";
      key: string;
      depth: number;
      label: string;
      count: number;
      instances: Id[];
      testId: string;
      problems: number;
    };

/** Plural of a role for test ids (`part-group-shelves`): the end-to-end contract. */
const PLURAL: Record<string, string> = {
  shelf: "shelves",
  side: "sides",
  top: "tops",
  bottom: "bottoms",
  back: "backs",
  partition: "partitions",
  front: "fronts",
};

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "Opening · 4 shelves": a count that names a parameter is shown as its value. */
function describeOpening(o: Opening, project: Project): string {
  const d = o.division;
  if (!d) return "Opening · empty";
  if (d.type === "partition") return `Opening · partition at ${d.at}`;
  const n = readCount(d.count, project);
  const count = n.ok ? String(n.value) : d.count;
  return d.type === "shelves" ? `Opening · ${count} shelves` : `Opening · ${count} bays`;
}

/** The first structure is called by the project's name; later ones as the engine numbers them. */
function structureLabel(project: Project, s: Structure, index: number): string {
  if (index === 0) return project.name;
  return `${s.type === "case" ? "Case" : "Box"} ${index + 1}`;
}

/** Boards still following their form are grouped by role; a detached board stands alone. */
const followsForm = (p: PlacedPart): boolean => p.source !== undefined && !p.detached;

/** The name a group of boards shows: "Side" for Right side and Left side. */
function groupLabel(p: PlacedPart): string {
  if (p.source && !p.detached)
    return p.source.role.charAt(0).toUpperCase() + p.source.role.slice(1);
  return p.name;
}

/**
 * The tree's rows in display order: each structure with its openings (indented by nesting), then
 * the boards grouped by role in the order the engine placed them. Never throws.
 */
export function treeRows(project: Project, result: SolveResult): TreeRow[] {
  const problemsOn = (parts: Set<Id>): number =>
    result.diagnostics.filter(
      (d) => d.severity !== "info" && d.part !== undefined && parts.has(d.part),
    ).length;
  const rows: TreeRow[] = [];

  const openingRows = (s: Structure, list: Opening[], depth: number): void => {
    for (const o of list) {
      rows.push({
        kind: "opening",
        key: `opening:${o.id}`,
        depth,
        label: describeOpening(o, project),
        structure: s.id,
        opening: o.id,
        problems: 0,
      });
      openingRows(s, o.children, depth + 1);
    }
  };

  const groups = new Map<string, { label: string; testId: string; placed: PlacedPart[] }>();
  for (const p of result.placements) {
    const key =
      p.source && followsForm(p) ? `${p.source.structure}:${p.source.role}` : `part:${p.part}`;
    const testId = `part-group-${p.source && followsForm(p) ? (PLURAL[p.source.role] ?? slug(p.source.role)) : slug(p.name)}`;
    const group = groups.get(key) ?? { label: groupLabel(p), testId, placed: [] };
    group.placed.push(p);
    groups.set(key, group);
  }

  for (const [index, s] of project.structures.entries()) {
    rows.push({
      kind: "structure",
      key: `structure:${s.id}`,
      depth: 0,
      label: structureLabel(project, s, index),
      structure: s.id,
      problems: 0,
    });
    openingRows(s, s.openings, 1);
  }
  for (const [key, g] of groups) {
    rows.push({
      kind: "group",
      key,
      depth: 1,
      label: g.label,
      count: g.placed.length,
      instances: g.placed.map((p) => p.instance),
      testId: g.testId,
      problems: problemsOn(new Set(g.placed.map((p) => p.part))),
    });
  }
  return rows;
}
