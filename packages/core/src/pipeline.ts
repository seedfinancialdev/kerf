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
  JointCut,
  JointSummary,
  MachiningSetup,
  NestingResult,
  PartShape,
  PlacedPart,
  RemovalPrimitive,
  SolveResult,
  Vec3,
} from "./outputs";
import { buildCutListFrom, type CutPart, cutParts } from "./outputs/cutlist";
import { buildSetups, toolFor } from "./outputs/machining";
import { validateAssembly } from "./outputs/validate";
import { shopProblem } from "./shop";
import { boxOf, toParent } from "./solve/assembly";
import { invalidProjectModel, type SolvedModel, solveValidatedModel } from "./solve/model";
import { generateFrom } from "./structures";
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

/**
 * What a fault in Kerf itself looks like to the user: said plainly, with a request to report it.
 */
function internalError(error: unknown): Diagnostic {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : "an unexpected value";
  return {
    severity: "error",
    rule: "internal-error",
    message: `Kerf could not finish solving this project (${reason}). This is a bug; please report it.`,
  };
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
    // Structures generate ordinary parts, joints and match sets on every solve; the generated
    // project is validated like any other so nothing downstream can see an invalid object.
    const generated = generateFrom(input, shop);
    if (!generated.ok) {
      return failed(invalidProjectModel(generated.problem.path, generated.problem.message));
    }
    const project = generated.project;
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
    return failed({
      diagnostics: [...gathered, internalError(error)],
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

const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Where every placed copy sits; from the solved model, so it exists even when cuts are withheld.
 */
function placementsOf(p: Pipeline): PlacedPart[] {
  const defs = new Map((p.project?.parts ?? []).map((d) => [d.id, d]));
  return p.parts.map(({ instance, part, length, width, thickness }) => {
    const frame = { instance, part };
    const origin = toParent(frame, [0, 0, 0]);
    const def = defs.get(part.id);
    const { min, max } = boxOf(instance);
    const placed: PlacedPart = {
      instance: instance.id,
      shape: p.derived.definitionOf.get(instance.id) ?? part.id,
      part: part.id,
      name: instance.name,
      partName: part.name,
      stock: part.stock,
      size: { length: part.length, width: part.width, thickness: part.thickness },
      cut: { length, width, thickness },
      box: { min, max },
      frame: {
        origin,
        x: minus(toParent(frame, [1, 0, 0]), origin),
        y: minus(toParent(frame, [0, 1, 0]), origin),
        z: minus(toParent(frame, [0, 0, 1]), origin),
      },
      detached: def?.detached === true,
    };
    if (def?.source) placed.source = { structure: def.source.structure, role: def.source.role };
    if (instance.pattern)
      placed.pattern = { id: instance.pattern.id, index: instance.pattern.index };
    return placed;
  });
}

/**
 * The shop profile when none is given: it owns no tool, so every cut is reported as needing the
 * tool that makes it (`toolFor`'s `missing`), which is what the Joinery step shows before a shop
 * is known.
 */
const NO_TOOLS: ShopProfile = { kerf: 0, tools: [] };

/** A board's name when the project gives it none at all (validation makes this unreachable). */
const UNNAMED = "an unnamed board";

/** Each joint with its cuts grouped by kind and size (ADR 015, rule 9). */
function jointSummariesOf(p: Pipeline, shop: ShopProfile | undefined): JointSummary[] {
  if (!p.project) return [];
  // The Joinery step shows these names, so a board is never named by its id: one with no name of
  // its own takes its part's name, as the cut list does.
  const names = new Map<Id, string>();
  const defNames = new Map(p.project.parts.map((d) => [d.id, d.name]));
  const partName = (def: Id | undefined): string =>
    (def !== undefined ? defNames.get(def) : undefined) ?? UNNAMED;
  for (const i of p.project.instances) names.set(i.id, i.name ?? partName(i.def));
  // A row is named for its part ("Shelf"), not for the copy it repeats ("Shelf 1").
  for (const row of p.project.patterns) {
    names.set(row.id, partName(p.project.instances.find((i) => i.id === row.source)?.def));
  }
  return p.project.joints.map((joint) => {
    const pairs = p.derived.pairs.filter((pair) => pair.joint === joint.id);
    const cuts = new Map<string, JointCut>();
    for (const cut of pairs.flatMap((pair) => pair.machined)) {
      const key = `${cut.kind}|${cut.width}|${cut.depth}`;
      const found = cuts.get(key);
      if (found) found.count += 1;
      else
        cuts.set(key, {
          kind: cut.kind,
          width: cut.width,
          depth: cut.depth,
          ...toolFor(cut, shop ?? NO_TOOLS),
          count: 1,
        });
    }
    const summary: JointSummary = {
      joint: joint.id,
      type: joint.type,
      host: names.get(joint.host) ?? UNNAMED,
      guest: names.get(joint.guest) ?? UNNAMED,
      pairs: pairs.length,
      cuts: [...cuts.values()],
    };
    if (joint.generatedBy) summary.source = joint.generatedBy;
    return summary;
  });
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
      diagnostics.push(internalError(error));
    }
  }

  const blocked = hasError(diagnostics);
  return {
    diagnostics: condense(diagnostics),
    cutList: p.cutList,
    nesting,
    setups,
    shapes: p.stopped ? [] : shapesOf(p),
    placements: placementsOf(p),
    joints: jointSummariesOf(p, copy),
    blocked,
  };
}
