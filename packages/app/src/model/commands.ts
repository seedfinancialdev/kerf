// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Every change the user can make, as a pure function from a project to a new project and the
// History label for it (design spec, "History"; Interaction spec: "Undo covers every action").
// Nothing here mutates its input; the store records what these return.

import {
  detachCopyIn,
  detachPartIn,
  type EdgeRef,
  type Expr,
  formatLength,
  generateStructures,
  type Id,
  type Instance,
  type Len,
  type Opening,
  type Param,
  type PlacedPart,
  type Project,
  projectFromTemplate,
  type ShopProfile,
  type Structure,
  TEMPLATES,
  withoutGenerated,
} from "@kerf/core";
import { newId } from "./ids";
import { choiceLabel, optionLabel, type SizeKey, sizeLabel } from "./labels";
import { exactLiteral, lengthOf, readCount, readLength, readPosition } from "./size";
import { STARTER_STOCK, STOCK_FOR } from "./starter";

export interface Edit {
  project: Project;
  /** What History shows for this change, in shop words. */
  label: string;
}
export type EditResult = { ok: true; edit: Edit } | { ok: false; message: string };

export type TemplateName = "Bookcase" | "Keepsake box" | "Blank case" | "Blank box";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A new project from a template, with the starter stock copied in. */
export function startProject(name: TemplateName, units: Project["units"]): Edit {
  const template = TEMPLATES.find((t) => t.name === name);
  if (!template) throw new RangeError(`There is no template named "${name}".`);
  const project = projectFromTemplate(template, {
    stock: structuredClone([...STARTER_STOCK]),
    stockFor: STOCK_FOR,
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
 * Typed text that is not a length comes back as `ok: false` with a message to show.
 * Throws RangeError for a structure the project does not have.
 */
export function setSize(project: Project, structure: Id, key: SizeKey, text: string): EditResult {
  const s = structureIn(project, structure);
  const current = s.size[key];
  const label = sizeLabel(s.type, key);
  const param = paramNamed(project, current);
  const read = readLength(text, project, param?.name);
  if (!read.ok) return { ok: false, message: read.message.replace(/^\w+ can't/, `${label} can't`) };
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

/** The project with one opening (anywhere in the tree) replaced; RangeError when it is not there. */
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

/** N equal bays across the opening. Throws RangeError for a structure or opening not in the project. */
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
 * Takes over a board the form made so it can be edited by hand (Interaction spec, "Tweak":
 * "detaches only that board"). A member of a row is taken out of the row on its own.
 * The engine detaches within the generated project (the saved one holds no generated boards), so
 * the form is generated first and what it made is dropped again, keeping the board taken over.
 * Callers pass the project's real shop: it only matters to an "auto" roundover, which takes the
 * largest bit the shop owns.
 * Throws RangeError when the project cannot be generated or the board cannot be detached.
 */
export function detachForEdit(
  project: Project,
  placed: PlacedPart,
  shop: ShopProfile,
): { project: Project; detached: boolean } {
  if (!placed.source || placed.detached) return { project, detached: false };
  const generated = generateStructures(project, shop);
  const taken = placed.pattern
    ? detachCopyIn(generated, placed.pattern.id, placed.pattern.index)
    : detachPartIn(generated, placed.part);
  return { project: withoutGenerated(taken), detached: true };
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
 * (see `detachForEdit`). Throws RangeError as `detachForEdit` does.
 */
export function addRoundover(
  project: Project,
  placed: PlacedPart,
  edges: EdgeRef[],
  radius: Len,
  shop: ShopProfile,
): Edit {
  const taken = detachForEdit(project, placed, shop);
  const partId = instanceOf(taken.project, placed)?.def ?? placed.part;
  const op = { id: newId(), type: "roundover" as const, edges, radius: exactLiteral(radius) };
  const next = {
    ...taken.project,
    parts: taken.project.parts.map((d) => (d.id === partId ? { ...d, ops: [...d.ops, op] } : d)),
  };
  return {
    project: next,
    label: `Roundover ${formatLength(radius, project.units)} on ${placed.name}`,
  };
}

/** Inches or millimetres for this project (ADR 015, rule 4). */
export function setUnits(project: Project, units: Project["units"]): Edit {
  return {
    project: { ...project, units },
    label: `Units: ${units === "imperial" ? "inches" : "millimetres"}`,
  };
}
