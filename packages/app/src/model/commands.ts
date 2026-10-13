// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The changes made from the panels (start, size, form choices, divisions, joinery, files), as pure
// functions from a project to a new project and the History label for it (design spec, "History";
// Interaction spec: "Undo covers every action"). The 3D tools' edits live beside their handlers in
// tools/. Nothing here mutates its input; the store records what these return.

import {
  attachCopyIn,
  attachPartIn,
  detachCopyIn,
  detachPartIn,
  type EdgeRef,
  type Expr,
  formatLength,
  generateStructures,
  gridSize,
  type Id,
  type Instance,
  type Len,
  type Opening,
  type Param,
  type PlacedPart,
  type Project,
  ProjectFormatError,
  projectFromTemplate,
  type ShopProfile,
  STOCK_FIELDS,
  type Stock,
  type Structure,
  TEMPLATES,
  type UserOp,
  withoutGenerated,
} from "@kerf/core";
import { newId } from "./ids";
import { choiceLabel, optionLabel, type SizeKey, sizeLabel } from "./labels";
import { exactLiteral, lengthOf, readCount, readLength, readPosition } from "./size";
import { starterStockFor, stockForUnits } from "./starter";

/** A change to the project and the History label for it, in shop words. */
export interface Edit {
  project: Project;
  /** What History shows for this change, in shop words. */
  label: string;
}
/** An edit that worked, or why it could not be made, in shop words. */
export type EditResult = { ok: true; edit: Edit } | { ok: false; message: string };

/** The templates a new project can start from, in the order the Start step lists them. */
export const TEMPLATE_NAMES = ["Bookcase", "Keepsake box", "Blank case", "Blank box"] as const;
/** A template the Start step offers. */
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A new project from a template, with the starter stock for `units` copied in (ADR 015, rule 4).
 */
export function startProject(name: TemplateName, units: Project["units"]): Edit {
  const template = TEMPLATES.find((t) => t.name === name);
  if (!template) throw new RangeError(`There is no template named "${name}".`);
  const project = projectFromTemplate(template, {
    stock: structuredClone([...starterStockFor(units)]),
    stockFor: stockForUnits(units),
  });
  return { project: { ...project, units }, label: `New ${name.toLowerCase()}` };
}

/** The project with one structure replaced by `change(structure)`. */
function withStructure(project: Project, id: Id, change: (s: Structure) => Structure): Project {
  return {
    ...project,
    structures: project.structures.map((s) => (s.id === id ? change(structuredClone(s)) : s)),
  };
}

function structureIn(project: Project, id: Id): Structure {
  const found = project.structures.find((s) => s.id === id);
  if (!found) throw new RangeError(`The project has no structure "${id}".`);
  return found;
}

/** The parameter a form field names (`width`), if it names one. */
function paramNamed(project: Project, expr: Expr): Param | undefined {
  return IDENTIFIER.test(expr) ? project.params.find((p) => p.name === expr) : undefined;
}

function setParam(project: Project, param: Param, expr: Expr): Project {
  return {
    ...project,
    params: project.params.map((p) => (p.id === param.id ? { ...p, expr } : p)),
  };
}

/**
 * Changes one overall size, typed by the user (ADR 015, rule 3: a named parameter is edited).
 * Typed text that is not a length, or a size of zero or less, comes back as `ok: false` with a
 * message to show. Throws RangeError for a structure the project does not have.
 */
export function setSize(project: Project, structure: Id, key: SizeKey, text: string): EditResult {
  const s = structureIn(project, structure);
  const current = s.size[key];
  const label = sizeLabel(s.type, key);
  const param = paramNamed(project, current);
  const read = readLength(text, project, param?.name, label);
  if (!read.ok) return read;
  if (read.value <= 0) return { ok: false, message: `${label} must be more than zero.` };
  const before = lengthOf(current, project);
  const next = param
    ? setParam(project, param, read.expr)
    : withStructure(project, structure, (st) => ({
        ...st,
        size: { ...st.size, [key]: read.expr },
      }));
  const shown = (v: Len | undefined): string =>
    v === undefined ? "?" : formatLength(v, project.units);
  return {
    ok: true,
    edit: { project: next, label: `${label} ${shown(before)} → ${shown(read.value)}` },
  };
}

/** Sets a form option (a choice, a stock, a flag, a depth). */
export function setOption(
  project: Project,
  structure: Id,
  key: string,
  value: string | boolean,
): Edit {
  const next = withStructure(project, structure, (s) => ({
    ...s,
    options: { ...s.options, [key]: value },
  }));
  const stock = typeof value === "string" ? project.stock.find((x) => x.id === value) : undefined;
  const shown =
    typeof value === "boolean" ? (value ? "on" : "off") : (stock?.name ?? choiceLabel(key, value));
  return { project: next, label: `${optionLabel(key)}: ${shown}` };
}

/**
 * Puts a form option back to its default by removing it, so the engine applies the spec's rule
 * (ADR 014, D1); an option already absent leaves the project as it was, which records nothing.
 */
export function resetOption(project: Project, structure: Id, key: string): Edit {
  const next = withStructure(project, structure, (s) => {
    const { [key]: _, ...rest } = s.options;
    return { ...s, options: rest };
  });
  return { project: next, label: `${optionLabel(key)}: Default` };
}

/**
 * The project with one opening (anywhere in the tree) replaced; RangeError when it is not there.
 */
function withOpening(
  project: Project,
  structure: Id,
  opening: Id,
  change: (o: Opening) => Opening,
): Project {
  openingIn(project, structure, opening);
  const walk = (list: Opening[]): Opening[] =>
    list.map((o) => (o.id === opening ? change(o) : { ...o, children: walk(o.children) }));
  return withStructure(project, structure, (s) => ({ ...s, openings: walk(s.openings) }));
}

function openingIn(project: Project, structure: Id, opening: Id): Opening {
  const find = (list: Opening[]): Opening | undefined => {
    for (const o of list) {
      if (o.id === opening) return o;
      const inner = find(o.children);
      if (inner) return inner;
    }
    return undefined;
  };
  const found = find(structureIn(project, structure).openings);
  if (!found) throw new RangeError(`The structure has no opening "${opening}".`);
  return found;
}

/**
 * Shelves in an opening: a new division, or a new count for the shelves already there. Text that
 * is not a whole number comes back as `ok: false`. Throws RangeError for a structure or opening
 * the project does not have.
 */
export function setShelves(
  project: Project,
  structure: Id,
  opening: Id,
  countText: string,
  spacing: "even" | Expr[],
): EditResult {
  const o = openingIn(project, structure, opening);
  const existing = o.division?.type === "shelves" ? o.division : undefined;
  const param = existing && paramNamed(project, existing.count);
  const read = readCount(countText, project, param?.name);
  if (!read.ok) return { ok: false, message: read.message };
  const before = existing ? readCount(existing.count, project) : undefined;
  const counted = param ? setParam(project, param, read.expr) : project;
  const count = param ? param.name : read.expr;
  const next = withOpening(counted, structure, opening, (x) => ({
    ...x,
    division: { type: "shelves", count, spacing },
    children: existing ? x.children : [],
  }));
  const label = before?.ok
    ? `Shelves ${before.value} → ${read.value}`
    : `Added ${read.value} shelves`;
  return { ok: true, edit: { project: next, label } };
}

/**
 * A vertical partition at a length or a fraction ("1/3") from the opening's left face (ADR 014,
 * D9). Throws RangeError for a structure or opening the project does not have.
 */
export function addPartition(
  project: Project,
  structure: Id,
  opening: Id,
  atText: string,
): EditResult {
  const read = readPosition(atText, project);
  if (!read.ok) return { ok: false, message: read.message };
  const children: Opening[] = [
    { id: newId(), children: [] },
    { id: newId(), children: [] },
  ];
  const next = withOpening(project, structure, opening, (x) => ({
    ...x,
    division: { type: "partition", at: read.expr },
    children,
  }));
  return { ok: true, edit: { project: next, label: `Added a partition at ${read.expr}` } };
}

/**
 * N equal bays across the opening. Throws RangeError for a structure or opening not in the project.
 */
export function splitBays(
  project: Project,
  structure: Id,
  opening: Id,
  countText: string,
): EditResult {
  const read = readCount(countText, project);
  if (!read.ok) return { ok: false, message: read.message };
  if (read.value < 2) return { ok: false, message: "Bays need a number of 2 or more." };
  const children: Opening[] = Array.from({ length: read.value }, () => ({
    id: newId(),
    children: [],
  }));
  const next = withOpening(project, structure, opening, (x) => ({
    ...x,
    division: { type: "bays", count: read.expr },
    children,
  }));
  return { ok: true, edit: { project: next, label: `Split into ${read.value} bays` } };
}

/** Empties an opening again. Throws RangeError for a structure or opening not in the project. */
export function clearDivision(project: Project, structure: Id, opening: Id): Edit {
  const next = withOpening(project, structure, opening, ({ division: _, ...rest }) => ({
    ...rest,
    children: [],
  }));
  return { project: next, label: "Emptied the opening" };
}

/** "Accept all" (ADR 015, D2): every form's joinery is marked reviewed; no board changes. */
export function acceptJoinery(project: Project): Edit {
  return {
    project: {
      ...project,
      structures: project.structures.map((s) => ({
        ...s,
        options: { ...s.options, joineryReviewed: true },
      })),
    },
    label: "Accepted the joinery",
  };
}

/** The form's shelf roundover (ADR 015, D3); null removes it. */
export function setShelfRoundover(project: Project, structure: Id, radius: Len | null): Edit {
  const next = withStructure(project, structure, (s) => {
    const { shelfRoundover: _, ...rest } = s.options;
    return {
      ...s,
      options: radius === null ? rest : { ...rest, shelfRoundover: exactLiteral(radius) },
    };
  });
  return {
    project: next,
    label:
      radius === null
        ? "No shelf roundover"
        : `Shelf roundover ${formatLength(radius, project.units)}`,
  };
}

/**
 * The operations without any roundover on `edges`: an edge has one roundover, so a new one
 * replaces the old, and "None" removes it. An operation left with no edges is dropped.
 */
export function withoutRoundoverOn(ops: UserOp[], edges: EdgeRef[]): UserOp[] {
  return ops.flatMap((op) => {
    if (op.type !== "roundover") return [op];
    const kept = op.edges.filter((e) => !edges.includes(e));
    return kept.length === 0 ? [] : [{ ...op, edges: kept }];
  });
}

/**
 * Why a board could not be taken over from its form, in shop words, for the user. Tools catch this
 * and nothing wider, so a fault in Kerf is never shown as a reason (silent-failure review M3).
 */
export class TakeOverError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TakeOverError";
  }
}

/** Said when the project has a problem that stops the engine placing its boards at all. */
export const UNPLACEABLE =
  "The project has a problem that stops Kerf placing its boards; fix it first.";

/** Said when a picked board is gone from the project (the pick is older than the last change). */
const gone = (placed: PlacedPart): TakeOverError =>
  new TakeOverError(`${placed.name} is no longer in the project; click it again.`);

/**
 * Takes over a board the form made so it can be edited by hand (Interaction spec, "Tweak":
 * "detaches only that board"). A member of a row is taken out of the row on its own; a board that
 * shares its part with others (the two sides) takes them over with it.
 * The engine detaches within the generated project (the saved one holds no generated boards), so
 * the form is generated first and what it made is dropped again, keeping the board taken over.
 * Callers pass the project's real shop: it only matters to an "auto" roundover, which takes the
 * largest bit the shop owns.
 * Throws TakeOverError, saying why, when the project's boards cannot be placed or the board is
 * gone or cannot be detached.
 */
export function detachForEdit(
  project: Project,
  placed: PlacedPart,
  shop: ShopProfile,
): { project: Project; detached: boolean } {
  if (!placed.source || placed.detached) return { project, detached: false };
  let generated: Project;
  try {
    generated = generateStructures(project, shop);
  } catch (error) {
    if (!(error instanceof ProjectFormatError)) throw error;
    throw new TakeOverError(UNPLACEABLE, { cause: error });
  }
  // The engine names a missing part or row by its id; the user picked it by name.
  const { pattern } = placed;
  if (!generated.parts.some((d) => d.id === placed.part)) throw gone(placed);
  if (pattern && !generated.patterns.some((p) => p.id === pattern.id)) throw gone(placed);
  try {
    const taken = pattern
      ? detachCopyIn(generated, pattern.id, pattern.index)
      : detachPartIn(generated, placed.part);
    return { project: withoutGenerated(taken), detached: true };
  } catch (error) {
    // The engine's other reasons are already in shop words ("There is no copy 4 of …").
    if (!(error instanceof RangeError)) throw error;
    throw new TakeOverError(error.message, { cause: error });
  }
}

/**
 * The saved instance a placed board stands for. A member of a row is not an instance of its own
 * until it is taken out; then it is the instance recording which row place it came from.
 */
export function instanceOf(project: Project, placed: PlacedPart): Instance | undefined {
  const { pattern } = placed;
  if (pattern) {
    return project.instances.find(
      (i) => i.detachedFrom?.pattern === pattern.id && i.detachedFrom.index === pattern.index,
    );
  }
  return project.instances.find((i) => i.id === placed.instance);
}

/**
 * A roundover on a board made by hand or taken over (ADR 015, D3). Pass the project's real shop
 * (see `detachForEdit`). Throws TakeOverError as `detachForEdit` does, and when the board is no
 * longer in the project (rounding another board's part instead would be a silent wrong edit).
 */
export function addRoundover(
  project: Project,
  placed: PlacedPart,
  edges: EdgeRef[],
  radius: Len,
  shop: ShopProfile,
): Edit {
  const taken = detachForEdit(project, placed, shop);
  const partId = instanceOf(taken.project, placed)?.def;
  if (partId === undefined) throw gone(placed);
  const op = { id: newId(), type: "roundover" as const, edges, radius: exactLiteral(radius) };
  const next = {
    ...taken.project,
    parts: taken.project.parts.map((d) =>
      d.id === partId ? { ...d, ops: [...withoutRoundoverOn(d.ops, edges), op] } : d,
    ),
  };
  return {
    project: next,
    label: `Roundover ${formatLength(radius, project.units)} on ${placed.name}`,
  };
}

/**
 * Hands a taken-over board back to its form (Domain model: "Undo re-attaches"). A copy taken out
 * of a row goes back into the row. Like `detachForEdit`, the engine re-attaches within the
 * generated project, so the form is generated first and what it made is dropped again.
 * A board that something you added refers to (a joint, a grain match) is refused with `ok: false`
 * and a message saying what to remove first.
 */
export function handBack(project: Project, placed: PlacedPart, shop: ShopProfile): EditResult {
  try {
    const generated = generateStructures(project, shop);
    const own = instanceOf(generated, placed);
    const attached = own?.detachedFrom
      ? attachCopyIn(generated, own.id)
      : attachPartIn(generated, own?.def ?? placed.part);
    return {
      ok: true,
      edit: {
        project: withoutGenerated(attached),
        label: `${placed.name} follows the form again`,
      },
    };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, message: error.message };
    throw error;
  }
}

/** Every stock a part or a structure's form uses (ADR 015, rule 4: units follow the stock). */
function stockInUse(project: Project): Stock[] {
  const ids = new Set<Id>(project.parts.map((p) => p.stock));
  for (const s of project.structures) {
    for (const field of STOCK_FIELDS[s.type]) {
      const chosen = s.options[field];
      if (typeof chosen === "string") ids.add(chosen);
    }
  }
  return project.stock.filter((s) => ids.has(s.id));
}

/**
 * Switches the project between inches and millimetres (ADR 015, rule 4). Only a project whose
 * stock all sits on the new grid can switch, because a thickness between grid steps would leave
 * joints that do not seat; otherwise says which stock is in the way, in the project's own units.
 */
export function switchUnits(project: Project, units: Project["units"]): EditResult {
  const grid = gridSize(units);
  const off = stockInUse(project).find((s) => s.thickness % grid !== 0);
  if (off) {
    const now = project.units === "imperial" ? "inches" : "millimetres";
    const step = units === "metric" ? "0.01 mm" : '1/64"';
    const thickness = formatLength(off.thickness, project.units);
    return {
      ok: false,
      message: `This project stays in ${now} because its ${off.name} is ${thickness} thick, which isn't a whole number of ${step}.`,
    };
  }
  return {
    ok: true,
    edit: {
      project: { ...project, units },
      label: `Units: ${units === "imperial" ? "inches" : "millimetres"}`,
    },
  };
}
