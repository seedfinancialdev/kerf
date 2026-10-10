// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The solve pipeline (Domain model v0, "Solve pipeline"), steps 1-6:
//   1-3 parameters, parts, instances and patterns   (solveModel)
//   4   joints                                      (deriveJoints)
//   5   validation                                  (validateAssembly)
//   6   outputs: cut list, nesting, machining setups
// Everything here is a pure function of the project and the shop profile.

import { deriveJoints } from "./joints/derive";
import { nestProject } from "./nest";
import type {
  CutList,
  Diagnostic,
  MachiningSetup,
  NestingResult,
  PartShape,
  RemovalPrimitive,
  SolveResult,
} from "./outputs";
import { buildCutListFrom, cutParts } from "./outputs/cutlist";
import { buildSetups } from "./outputs/machining";
import { validateAssembly } from "./outputs/validate";
import { type SolvedModel, solveModel } from "./solve/model";
import type { Id, Project, ShopProfile } from "./types";

const EMPTY_NESTING: NestingResult = { sheets: [], boards: [], sheetCountByStock: {} };

export interface Pipeline {
  model: SolvedModel;
  derived: ReturnType<typeof deriveJoints>;
  cutList: CutList;
  diagnostics: Diagnostic[];
  parts: ReturnType<typeof cutParts>;
}

/** Steps 1-5 and the cut list. Never throws for bad project data. */
export function runPipeline(project: Project): Pipeline {
  const model = solveModel(project);
  const empty: Pipeline = {
    model,
    derived: {
      pairs: [],
      instances: new Map(),
      definitionOf: new Map(),
      machined: [],
      roundedEdges: [],
      diagnostics: [],
    },
    cutList: { lines: [], blocks: [] },
    diagnostics: [...model.diagnostics],
    parts: [],
  };
  if (model.diagnostics.some((d) => d.rule === "invalid-project" || d.rule === "internal-error")) {
    return empty;
  }
  const derived = deriveJoints(project, model);
  const parts = cutParts(model, derived);
  const cutList = buildCutListFrom(project, parts);
  const diagnostics = [
    ...model.diagnostics,
    ...derived.diagnostics,
    ...validateAssembly(project, model, derived),
  ];
  return { model, derived, cutList, diagnostics, parts };
}

function shapesOf(p: Pipeline): PartShape[] {
  const shapes = new Map<Id, PartShape>();
  for (const cut of p.parts) {
    const definition = p.derived.definitionOf.get(cut.instance.id) ?? cut.part.id;
    if (shapes.has(definition)) continue;
    const removals: RemovalPrimitive[] = p.derived.instances.get(cut.instance.id)?.cuts ?? [];
    shapes.set(definition, {
      definition,
      name: cut.part.name,
      length: cut.part.length,
      width: cut.part.width,
      thickness: cut.part.thickness,
      removals,
    });
  }
  return [...shapes.values()];
}

/** The whole pipeline. Never throws: anything unexpected is an "internal-error" diagnostic. */
export function solveProject(project: Project, shop: ShopProfile): SolveResult {
  try {
    const p = runPipeline(project);
    if (p.model.diagnostics.some((d) => d.rule === "invalid-project")) {
      return {
        diagnostics: p.diagnostics,
        cutList: p.cutList,
        nesting: EMPTY_NESTING,
        setups: [],
        shapes: [],
      };
    }
    const nested = nestProject(project, p.parts, shop);
    const setups: MachiningSetup[] = buildSetups(project, p.parts, p.derived, shop);
    return {
      diagnostics: [...p.diagnostics, ...nested.diagnostics],
      cutList: p.cutList,
      nesting: nested.result,
      setups,
      shapes: shapesOf(p),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? `${error.name}: ${error.message}` : "an unexpected value";
    return {
      diagnostics: [
        {
          severity: "error",
          rule: "internal-error",
          message: `Kerf could not finish solving this project (${reason}). This is a bug; please report it.`,
        },
      ],
      cutList: { lines: [], blocks: [] },
      nesting: EMPTY_NESTING,
      setups: [],
      shapes: [],
    };
  }
}
