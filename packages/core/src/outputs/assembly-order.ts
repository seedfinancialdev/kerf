// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Assembly order (Interaction spec, "The build plan", item 6: "comes from the structure in the
// prototype (case: dry-fit, glue carcase, square it, fit back last)"). Wording: ADR 015, rule 5.

import type { AssemblyStep } from "../outputs";
import { runPipeline } from "../pipeline";
import type { SolvedInstance } from "../solve/model";
import type { Id, Project, ShopProfile, Structure } from "../types";

interface Board {
  id: Id;
  name: string;
  role: string;
}

/** "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Names in first-appearance order, "N × Name" when a name repeats. */
function counted(boards: Board[]): string {
  const counts = new Map<string, number>();
  for (const b of boards) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
  return listed([...counts].map(([name, n]) => (n > 1 ? `${n} × ${name}` : name)));
}

function caseSteps(boards: Board[]): AssemblyStep[] {
  const all = boards.map((b) => b.id);
  const sides = boards.filter((b) => b.role === "side");
  const glued = boards.filter((b) => b.role !== "side" && b.role !== "back");
  const back = boards.find((b) => b.role === "back");
  const steps: AssemblyStep[] = [
    { text: "Dry-fit the case without glue and check that every joint closes.", parts: all },
    {
      text: `Glue ${counted(glued)} into the sides.`,
      parts: [...glued, ...sides].map((b) => b.id),
    },
    {
      text: "Square the case: the two diagonals must match. Adjust before the glue sets.",
      parts: all,
    },
  ];
  if (back) steps.push({ text: `Fit the ${back.name} last.`, parts: [back.id] });
  return steps;
}

function boxSteps(boards: Board[]): AssemblyStep[] {
  const all = boards.map((b) => b.id);
  const bottom = boards.find((b) => b.role === "bottom");
  return [
    { text: "Dry-fit the box without glue and check that every corner closes.", parts: all },
    bottom
      ? {
          text: `Glue the corners with the ${bottom.name} in its groove, not glued, so it can move.`,
          parts: all,
        }
      : { text: "Glue the corners.", parts: all },
    {
      text: "Square the box: the two diagonals must match. Adjust before the glue sets.",
      parts: all,
    },
  ];
}

/**
 * The order to put each structure together, from its form: dry-fit, glue, square, and for a case
 * the back last. Each step names the placed boards it touches. Empty for a project with no
 * structure or one that cannot be solved. Never throws; the project and the shop profile are not
 * changed.
 */
export function assemblyOrder(project: Project, shop: ShopProfile): AssemblyStep[] {
  const p = runPipeline(project, shop);
  if (!p.project) return [];
  const defs = new Map(p.project.parts.map((d) => [d.id, d]));
  // A row of boards is named per member ("Shelf 1".."Shelf 4"); the step counts them by the
  // part's own name, so four shelves read "4 × Shelf".
  const boardsOf = (structure: Structure): Board[] =>
    p.model.instances.flatMap((i: SolvedInstance) => {
      const def = defs.get(i.def);
      return def?.source?.structure === structure.id
        ? [{ id: i.id, name: def.name, role: def.source.role }]
        : [];
    });
  return p.project.structures.flatMap((structure, index) => {
    const steps =
      structure.type === "case" ? caseSteps(boardsOf(structure)) : boxSteps(boardsOf(structure));
    if (index === 0) return steps;
    const prefix = `${structure.type === "case" ? "Case" : "Box"} ${index + 1}: `;
    return steps.map((s) => ({ ...s, text: prefix + s.text }));
  });
}
