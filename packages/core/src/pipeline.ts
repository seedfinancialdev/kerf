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
import { generate } from "./structures";
import type { Id, Project, ShopProfile } from "./types";

const NO_CUTS: CutList = { lines: [], blocks: [] };
const NO_NESTING: NestingResult = {
  sheets: [],
  boards: [],
  sheetCountByStock: {},
  totals: [],
};

export interface Pipeline {
  /** The validated project the stages read; undefined when the project is not valid. */
  project: Project | undefined;
  model: SolvedModel;
  derived: Derived;
  parts: CutPart[];
  cutList: CutList;
  diagnostics: Diagnostic[];
  /**
   * True when steps 1-5 found an error: the cut list is withheld and nesting and setups are
   * skipped. `derived` and `parts` are still filled in unless the project was invalid.
   */
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
export function runPipeline(input: unknown, shop?: ShopProfile): Pipeline {
  // What was found before anything went wrong; an unexpected failure adds to it, never replaces it.
  let gathered: Diagnostic[] = [];
  try {
    const checked = validateProject(input);
    if (checked.problem) {
      return failed(invalidProjectModel(checked.problem.path, checked.problem.message));
    }
    // Structures generate ordinary parts, joints and match sets on every solve; the generated
    // project is validated like any other so nothing downstream can see an invalid object.
    const generated = generate(checked.project, shop);
    const whole = validateProject(generated.project);
    if (whole.problem) {
      return failed(invalidProjectModel(whole.problem.path, whole.problem.message));
    }
    const project = whole.project;
    const model = solveValidatedModel(project);
    model.diagnostics.unshift(...generated.diagnostics);
    gathered = model.diagnostics;
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
        ...gathered,
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

/**
 * Reads the shop profile once, into a plain copy that is then validated and used, so a profile
 * whose answers change between reads (or that throws when read) cannot be valid and then not.
 */
function readShop(shop: unknown): { shop?: ShopProfile; problem?: Diagnostic } {
  let copy: unknown;
  try {
    const text = JSON.stringify(shop);
    copy = text === undefined ? undefined : JSON.parse(text);
  } catch {
    return {
      problem: {
        severity: "error",
        rule: "invalid-shop",
        message: "The shop profile is not valid: it could not be read.",
        field: "shop profile",
      },
    };
  }
  const problem = shopProblem(copy);
  return problem ? { problem } : { shop: copy as ShopProfile };
}

/** The whole pipeline. Never throws: anything unexpected is an "internal-error" diagnostic. */
export function solveProject(project: Project, shop: ShopProfile): SolveResult {
  // The shop is read once, first: structures use it too (a roundover taken from the bits owned).
  const { shop: copy, problem: shopIssue } = readShop(shop);
  const p = runPipeline(project, copy);
  const diagnostics: Diagnostic[] = [...p.diagnostics];
  if (shopIssue) diagnostics.push(shopIssue);

  let nesting: NestingResult = NO_NESTING;
  let setups: MachiningSetup[] = [];
  if (!p.stopped && p.project && copy) {
    try {
      const nested = nestProject(p.project, p.parts, copy);
      nesting = nested.result;
      diagnostics.push(...nested.diagnostics);
      setups = buildSetups(p.project, p.parts, p.derived, copy);
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

  const blocked = hasError(diagnostics);
  return {
    diagnostics: condense(diagnostics),
    cutList: p.cutList,
    nesting,
    setups,
    shapes: p.stopped ? [] : shapesOf(p),
    blocked,
  };
}
