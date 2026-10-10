// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The solve pipeline (Domain model v0, "Solve pipeline"), steps 1-6:
//   1-3 parameters, parts, instances and patterns   (solveValidatedModel)
//   4   joints                                      (deriveJoints)
//   5   validation                                  (validateAssembly)
//   6   outputs: cut list, nesting, machining setups
// Everything here is a pure function of the project and the shop profile, and every stage reads the
// validated copy of the project, never the object that was passed in.
//
// An error in steps 1-5 blocks the solve (Operation specs, "Validation levels"): the diagnostics
// are reported in full, but no cut list, layout or setup is produced from a project that cannot be
// built. Warnings and info never block.

import { condense } from "./diagnostics";
import { type Derived, deriveJoints, emptyDerived } from "./joints/derive";
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
import { buildCutListFrom, type CutPart, cutParts } from "./outputs/cutlist";
import { buildSetups } from "./outputs/machining";
import { validateAssembly } from "./outputs/validate";
import { validateProject } from "./project-file";
import { shopProblem } from "./shop";
import { invalidProjectModel, type SolvedModel, solveValidatedModel } from "./solve/model";
import type { Id, Project, ShopProfile } from "./types";

const NO_CUTS: CutList = { lines: [], blocks: [] };
const NO_NESTING: NestingResult = { sheets: [], boards: [], sheetCountByStock: {} };

export interface Pipeline {
  /** The validated project the stages read; undefined when the project is not valid. */
  project: Project | undefined;
  model: SolvedModel;
  derived: Derived;
  parts: CutPart[];
  cutList: CutList;
  diagnostics: Diagnostic[];
  /** True when steps 1-5 found an error, so nothing was derived from the project. */
  stopped: boolean;
}

const hasError = (list: Diagnostic[]): boolean => list.some((d) => d.severity === "error");

function failed(model: SolvedModel): Pipeline {
  return {
    project: undefined,
    model,
    derived: emptyDerived(),
    parts: [],
    cutList: NO_CUTS,
    diagnostics: model.diagnostics,
    stopped: true,
  };
}

/** Steps 1-5 and the cut list. Never throws. */
export function runPipeline(input: unknown): Pipeline {
  try {
    const checked = validateProject(input);
    if (checked.problem) {
      return failed(invalidProjectModel(checked.problem.path, checked.problem.message));
    }
    const project = checked.project;
    const model = solveValidatedModel(project);
    if (model.diagnostics.some((d) => d.rule === "internal-error")) return failed(model);

    const derived = deriveJoints(project, model);
    const diagnostics = [
      ...model.diagnostics,
      ...derived.diagnostics,
      ...validateAssembly(model, derived),
    ];
    const stopped = hasError(diagnostics);
    const parts = cutParts(model, derived);
    return {
      project,
      model,
      derived,
      parts,
      cutList: stopped ? NO_CUTS : buildCutListFrom(project, parts),
      diagnostics,
      stopped,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? `${error.name}: ${error.message}` : "an unexpected value";
    return failed({
      diagnostics: [
        {
          severity: "error",
          rule: "internal-error",
          message: `Kerf could not finish solving this project (${reason}). This is a bug; please report it.`,
        },
      ],
      params: {},
      scope: {},
      parts: [],
      instances: [],
    });
  }
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
  const p = runPipeline(project);
  const shopIssue = shopProblem(shop);
  const diagnostics: Diagnostic[] = [...p.diagnostics];
  if (shopIssue) diagnostics.push(shopIssue);

  let nesting: NestingResult = NO_NESTING;
  let setups: MachiningSetup[] = [];
  if (!p.stopped && p.project && !shopIssue) {
    try {
      const nested = nestProject(p.project, p.parts, shop);
      nesting = nested.result;
      setups = buildSetups(p.project, p.parts, p.derived, shop);
      diagnostics.push(...nested.diagnostics);
    } catch (error) {
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : "an unexpected value";
      diagnostics.push({
        severity: "error",
        rule: "internal-error",
        message: `Kerf could not finish solving this project (${reason}). This is a bug; please report it.`,
      });
    }
  }

  return {
    diagnostics: condense(diagnostics),
    cutList: p.cutList,
    nesting,
    setups,
    shapes: p.stopped ? [] : shapesOf(p),
    blocked: hasError(diagnostics),
  };
}
