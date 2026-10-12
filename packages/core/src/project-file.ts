// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// project.json: strict reading and canonical writing (Domain model v0, "Invariants", "`.kerf` file").
//
// - Every saved length is an integer; floats are rejected.
// - Unknown keys are rejected, so load → save is byte-identical.
// - Canonical form: keys sorted by code point, 2-space indent, trailing newline.
// - Older schema versions migrate forward on load; the app never writes an older version.

import { MAX_LENGTH } from "./length";
import { MAX_PATTERN_COUNT } from "./solve/limits";
import { isOrientationIndex } from "./solve/orientation";
import { strandedReferences, withoutGenerated } from "./structures/strip";
import type {
  EdgeRef,
  GeneratedFrom,
  Id,
  Instance,
  Joint,
  MatchSet,
  Opening,
  Param,
  PartDef,
  Pattern,
  Project,
  Stock,
  Structure,
  UserOp,
} from "./types";
import { INCH } from "./units";

export const CURRENT_SCHEMA_VERSION = 1;

/** Thrown for any project data that does not match the schema. `path` locates the problem. */
export class ProjectFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProjectFormatError";
    this.path = path;
  }
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const EDGE_REF = /^(end0|end1|edge0|edge1)\/(face0|face1)$/;

class Reader {
  private readonly seen = new Set<string>();
  private readonly raw: Record<string, unknown>;

  constructor(
    value: unknown,
    readonly path: string,
  ) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ProjectFormatError(path, "expected an object");
    }
    this.raw = value as Record<string, unknown>;
  }

  private at(key: string): string {
    return `${this.path}.${key}`;
  }

  private take(key: string): unknown {
    this.seen.add(key);
    return this.raw[key];
  }

  has(key: string): boolean {
    return this.raw[key] !== undefined;
  }

  string(key: string): string {
    const value = this.take(key);
    if (typeof value !== "string") throw new ProjectFormatError(this.at(key), "expected a string");
    return value;
  }

  optionalString(key: string): string | undefined {
    return this.has(key) ? this.string(key) : undefined;
  }

  id(key: string): Id {
    const value = this.string(key);
    if (!ULID.test(value)) throw new ProjectFormatError(this.at(key), "expected a ULID");
    return value;
  }

  optionalId(key: string): Id | undefined {
    return this.has(key) ? this.id(key) : undefined;
  }

  integer(key: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
    const value = this.take(key);
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new ProjectFormatError(this.at(key), "expected a whole number (no floats are saved)");
    }
    if (value < min || value > max) {
      const shown = (n: number): string =>
        max === MAX_LENGTH && Math.abs(n) <= MAX_LENGTH ? `${n / INCH} in` : String(n);
      throw new ProjectFormatError(
        this.at(key),
        `expected a value from ${shown(min)} to ${shown(max)}`,
      );
    }
    return value;
  }

  optionalInteger(key: string, min: number, max: number): number | undefined {
    return this.has(key) ? this.integer(key, min, max) : undefined;
  }

  boolean(key: string): boolean {
    const value = this.take(key);
    if (typeof value !== "boolean")
      throw new ProjectFormatError(this.at(key), "expected true or false");
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const value = this.string(key);
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ProjectFormatError(this.at(key), `expected one of ${allowed.join(", ")}`);
    }
    return value as T;
  }

  object(key: string): Reader {
    return new Reader(this.take(key), this.at(key));
  }

  optionalObject(key: string): Reader | undefined {
    return this.has(key) ? this.object(key) : undefined;
  }

  array<T>(key: string, read: (item: unknown, path: string) => T): T[] {
    const value = this.take(key);
    if (!Array.isArray(value)) throw new ProjectFormatError(this.at(key), "expected a list");
    return value.map((item, i) => read(item, `${this.at(key)}[${i}]`));
  }

  /** A map of string keys to string (or boolean when allowed) values. Every key is kept. */
  record<T extends string | boolean>(
    key: string,
    accepts: (v: unknown) => v is T,
    description: string,
  ): Record<string, T> {
    const value = this.take(key);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ProjectFormatError(this.at(key), "expected an object");
    }
    const entries: Array<[string, T]> = [];
    for (const [k, v] of Object.entries(value)) {
      if (!accepts(v))
        throw new ProjectFormatError(`${this.at(key)}.${k}`, `expected ${description}`);
      entries.push([k, v]);
    }
    // fromEntries defines own properties, so a "__proto__" key is kept rather than lost.
    return Object.fromEntries(entries);
  }

  /** `"even"` or a list of expressions, for a shelves division. */
  spacingValue(): "even" | string[] {
    const value = this.take("spacing");
    if (value === "even") return "even";
    if (Array.isArray(value) && value.every(isString)) return value;
    throw new ProjectFormatError(this.at("spacing"), 'expected "even" or a list of expressions');
  }

  /** Call last: rejects keys the schema does not know. */
  done(): void {
    for (const key of Object.keys(this.raw)) {
      if (!this.seen.has(key)) throw new ProjectFormatError(this.at(key), "unknown field");
    }
  }
}

const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrBoolean = (v: unknown): v is string | boolean =>
  typeof v === "string" || typeof v === "boolean";

function readParam(value: unknown, path: string): Param {
  const r = new Reader(value, path);
  const param: Param = {
    id: r.id("id"),
    name: r.string("name"),
    expr: r.string("expr"),
    kind: r.oneOf("kind", ["length", "count", "ratio"] as const),
  };
  r.done();
  return param;
}

function readStock(value: unknown, path: string): Stock {
  const r = new Reader(value, path);
  const stock: Stock = {
    id: r.id("id"),
    name: r.string("name"),
    kind: r.oneOf("kind", ["sheet", "solid", "dimensional"] as const),
    thickness: r.integer("thickness", 1, MAX_LENGTH),
    allowance: { length: 0, width: 0 },
  };

  const sheet = r.optionalObject("sheet");
  if (sheet) {
    stock.sheet = {
      length: sheet.integer("length", 1, MAX_LENGTH),
      width: sheet.integer("width", 1, MAX_LENGTH),
      grain: sheet.oneOf("grain", ["along-length", "none"] as const),
    };
    sheet.done();
  }

  const solid = r.optionalObject("solid");
  if (solid) {
    stock.solid = {
      standardLengths: solid.array("standardLengths", (item, p) => {
        if (
          typeof item !== "number" ||
          !Number.isSafeInteger(item) ||
          item < 1 ||
          item > MAX_LENGTH
        ) {
          throw new ProjectFormatError(p, "expected a whole number of units");
        }
        return item;
      }),
      maxWidth: solid.integer("maxWidth", 1, MAX_LENGTH),
    };
    solid.done();
  }

  if (stock.kind === "sheet" && stock.solid) {
    throw new ProjectFormatError(`${path}.solid`, "sheet stock cannot have board sizes");
  }
  if (stock.kind !== "sheet" && stock.sheet) {
    throw new ProjectFormatError(`${path}.sheet`, "only sheet stock has sheet sizes");
  }

  const allowance = r.object("allowance");
  stock.allowance = {
    length: allowance.integer("length", 0, MAX_LENGTH),
    width: allowance.integer("width", 0, MAX_LENGTH),
  };
  allowance.done();

  const price = r.optionalObject("price");
  if (price) {
    stock.price = {
      per: price.oneOf("per", ["sheet", "boardFoot", "linearFoot"] as const),
      cents: price.integer("cents", 0),
    };
    price.done();
  }

  r.done();
  return stock;
}

function readUserOp(value: unknown, path: string): UserOp {
  const r = new Reader(value, path);
  const op: UserOp = {
    id: r.id("id"),
    type: r.oneOf("type", ["roundover"] as const),
    edges: r.array("edges", (item, p) => {
      if (typeof item !== "string" || !EDGE_REF.test(item)) {
        throw new ProjectFormatError(p, 'expected an edge such as "edge1/face1"');
      }
      return item as EdgeRef;
    }),
    radius: r.string("radius"),
  };
  r.done();
  return op;
}

function readPartDef(value: unknown, path: string): PartDef {
  const r = new Reader(value, path);
  const part: PartDef = {
    id: r.id("id"),
    name: r.string("name"),
    stock: r.id("stock"),
    length: r.string("length"),
    width: r.string("width"),
    grainLocked: r.boolean("grainLocked"),
    ops: r.array("ops", readUserOp),
  };
  const thickness = r.optionalString("thickness");
  if (thickness !== undefined) part.thickness = thickness;
  const notes = r.optionalString("notes");
  if (notes !== undefined) part.notes = notes;
  const source = r.optionalObject("source");
  if (source) {
    part.source = { structure: source.id("structure"), role: source.string("role") };
    source.done();
  }
  if (r.has("detached")) part.detached = r.boolean("detached");
  r.done();
  return part;
}

/** The optional `source` of a generated object. */
function readGeneratedBy(r: Reader): GeneratedFrom | undefined {
  const source = r.optionalObject("generatedBy");
  if (!source) return undefined;
  const from = { structure: source.id("structure"), role: source.string("role") };
  source.done();
  return from;
}

function readInstance(value: unknown, path: string): Instance {
  const r = new Reader(value, path);
  const position = r.object("position");
  const instance: Instance = {
    id: r.id("id"),
    def: r.id("def"),
    position: { x: position.string("x"), y: position.string("y"), z: position.string("z") },
    orientation: r.integer("orientation", 0, 23),
    mirrored: r.boolean("mirrored"),
  };
  position.done();
  if (!isOrientationIndex(instance.orientation)) {
    throw new ProjectFormatError(`${path}.orientation`, "expected 0-23");
  }
  const name = r.optionalString("name");
  if (name !== undefined) instance.name = name;
  const parent = r.optionalId("parent");
  if (parent !== undefined) instance.parent = parent;
  const from = readGeneratedBy(r);
  if (from) instance.generatedBy = from;
  const detachedFrom = r.optionalObject("detachedFrom");
  if (detachedFrom) {
    instance.detachedFrom = {
      pattern: detachedFrom.id("pattern"),
      index: detachedFrom.integer("index", 0, MAX_PATTERN_COUNT),
    };
    detachedFrom.done();
  }
  r.done();
  return instance;
}

function readPattern(value: unknown, path: string): Pattern {
  const r = new Reader(value, path);
  const id = r.id("id");
  const source = r.id("source");
  const count = r.string("count");
  const axis = r.oneOf("axis", ["x", "y", "z"] as const);
  const spacing = r.object("spacing");
  const mode = spacing.oneOf("mode", ["fixed", "distribute"] as const);
  const result: Pattern =
    mode === "fixed"
      ? { id, source, count, axis, spacing: { mode, step: spacing.string("step") } }
      : {
          id,
          source,
          count,
          axis,
          spacing: { mode, from: spacing.string("from"), to: spacing.string("to") },
        };
  spacing.done();
  if (r.has("skip")) {
    result.skip = r.array("skip", (item, p) => {
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) {
        throw new ProjectFormatError(p, "expected a member number (0 or more)");
      }
      return item;
    });
  }
  const from = readGeneratedBy(r);
  if (from) result.generatedBy = from;
  r.done();
  return result;
}

function readMatchSet(value: unknown, path: string): MatchSet {
  const r = new Reader(value, path);
  const set: MatchSet = {
    id: r.id("id"),
    name: r.string("name"),
    type: r.oneOf("type", ["continuousGrain", "bookmatch", "sameBoard"] as const),
    members: r.array("members", (item, p) => {
      if (typeof item !== "string" || !ULID.test(item))
        throw new ProjectFormatError(p, "expected a ULID");
      return item;
    }),
  };
  if (r.has("axis")) set.axis = r.oneOf("axis", ["length", "width"] as const);
  const from = readGeneratedBy(r);
  if (from) set.generatedBy = from;
  r.done();
  return set;
}

function readJoint(value: unknown, path: string): Joint {
  const r = new Reader(value, path);
  const joint: Joint = {
    id: r.id("id"),
    type: r.oneOf("type", ["dado", "rabbet", "throughDovetail"] as const),
    host: r.id("host"),
    guest: r.id("guest"),
    params: r.record("params", isString, "a string expression"),
  };
  const from = readGeneratedBy(r);
  if (from) joint.generatedBy = from;
  r.done();
  return joint;
}

/** Deepest nesting of openings accepted in a file. */
const MAX_OPENING_DEPTH = 32;

function readOpening(value: unknown, path: string, depth = 0): Opening {
  if (depth >= MAX_OPENING_DEPTH) {
    throw new ProjectFormatError(
      path,
      `openings are too deeply nested (at most ${MAX_OPENING_DEPTH} levels)`,
    );
  }
  const r = new Reader(value, path);
  const opening: Opening = { id: r.id("id"), children: [] };
  const division = r.optionalObject("division");
  if (division) {
    const type = division.oneOf("type", ["shelves", "partition", "bays"] as const);
    if (type === "shelves") {
      opening.division = {
        type,
        count: division.string("count"),
        spacing: division.spacingValue(),
      };
    } else if (type === "partition") {
      opening.division = { type, at: division.string("at") };
    } else {
      opening.division = { type, count: division.string("count") };
    }
    division.done();
  }
  opening.children = r.array("children", (item, p) => readOpening(item, p, depth + 1));
  r.done();
  return opening;
}

function readStructure(value: unknown, path: string): Structure {
  const r = new Reader(value, path);
  const size = r.object("size");
  const structure: Structure = {
    id: r.id("id"),
    type: r.oneOf("type", ["case", "box"] as const),
    size: { w: size.string("w"), h: size.string("h"), d: size.string("d") },
    options: r.record("options", isStringOrBoolean, "text or true/false"),
    openings: r.array("openings", readOpening),
  };
  size.done();
  r.done();
  return structure;
}

function* openingIds(openings: Opening[], path: string): Generator<[Id, string]> {
  for (const [i, opening] of openings.entries()) {
    yield [opening.id, `${path}[${i}]`];
    yield* openingIds(opening.children, `${path}[${i}].children`);
  }
}

/** Ids are never reused (Domain model, `Id`), and every reference must point at something. */
function checkIntegrity(project: Project): void {
  const owners = new Map<Id, string>();
  const claim = (id: Id, path: string): void => {
    const previous = owners.get(id);
    if (previous !== undefined) {
      throw new ProjectFormatError(path, `duplicate id (also used at ${previous})`);
    }
    owners.set(id, path);
  };
  const lists: Array<[string, ReadonlyArray<{ id: Id }>]> = [
    ["params", project.params],
    ["stock", project.stock],
    ["parts", project.parts],
    ["instances", project.instances],
    ["patterns", project.patterns],
    ["joints", project.joints],
    ["matchSets", project.matchSets],
    ["structures", project.structures],
  ];
  for (const [name, items] of lists) {
    for (const [i, item] of items.entries()) claim(item.id, `$.${name}[${i}].id`);
  }
  for (const [i, structure] of project.structures.entries()) {
    for (const [id, path] of openingIds(structure.openings, `$.structures[${i}].openings`)) {
      claim(id, `${path}.id`);
    }
  }
  for (const [i, part] of project.parts.entries()) {
    for (const [j, op] of part.ops.entries()) claim(op.id, `$.parts[${i}].ops[${j}].id`);
  }

  const stock = new Set(project.stock.map((x) => x.id));
  const parts = new Set(project.parts.map((x) => x.id));
  const instances = new Set(project.instances.map((x) => x.id));
  const patterns = new Set(project.patterns.map((x) => x.id));
  const need = (ok: boolean, path: string, what: string): void => {
    if (!ok) throw new ProjectFormatError(path, `refers to ${what} that does not exist`);
  };

  const structures = new Set(project.structures.map((x) => x.id));
  for (const [i, part] of project.parts.entries()) {
    need(stock.has(part.stock), `$.parts[${i}].stock`, "stock");
    if (part.source !== undefined) {
      need(structures.has(part.source.structure), `$.parts[${i}].source.structure`, "a structure");
    }
  }
  const sourced: Array<[string, Array<{ generatedBy?: GeneratedFrom }>]> = [
    ["instances", project.instances],
    ["patterns", project.patterns],
    ["joints", project.joints],
    ["matchSets", project.matchSets],
  ];
  for (const [key, list] of sourced) {
    for (const [i, item] of list.entries()) {
      if (item.generatedBy !== undefined) {
        need(
          structures.has(item.generatedBy.structure),
          `$.${key}[${i}].generatedBy.structure`,
          "a structure",
        );
      }
    }
  }
  for (const [i, instance] of project.instances.entries()) {
    need(parts.has(instance.def), `$.instances[${i}].def`, "a part");
    if (instance.parent !== undefined) {
      need(instances.has(instance.parent), `$.instances[${i}].parent`, "a placed part");
    }
  }
  const parentOf = new Map(project.instances.map((x) => [x.id, x.parent]));
  for (const [i, instance] of project.instances.entries()) {
    const seen = new Set<Id>([instance.id]);
    for (let at = instance.parent; at !== undefined; at = parentOf.get(at)) {
      if (seen.has(at)) {
        throw new ProjectFormatError(`$.instances[${i}].parent`, "is part of a parent loop");
      }
      seen.add(at);
    }
  }
  for (const [i, pattern] of project.patterns.entries()) {
    need(instances.has(pattern.source), `$.patterns[${i}].source`, "a placed part");
  }
  for (const [i, joint] of project.joints.entries()) {
    const known = (id: Id): boolean => instances.has(id) || patterns.has(id);
    need(known(joint.host), `$.joints[${i}].host`, "a placed part or pattern");
    need(known(joint.guest), `$.joints[${i}].guest`, "a placed part or pattern");
    if (joint.host === joint.guest) {
      throw new ProjectFormatError(`$.joints[${i}].guest`, "cannot be the same part as the host");
    }
  }
  const repeated = new Set(project.patterns.map((p) => p.source));
  const setOf = new Map<Id, string>();
  for (const [i, set] of project.matchSets.entries()) {
    const members = new Set<Id>();
    for (const [j, member] of set.members.entries()) {
      const path = `$.matchSets[${i}].members[${j}]`;
      need(instances.has(member), path, "a placed part");
      if (members.has(member)) throw new ProjectFormatError(path, "is listed twice");
      if (repeated.has(member)) {
        throw new ProjectFormatError(
          path,
          "is repeated by a pattern, so its copies cannot be listed",
        );
      }
      const other = setOf.get(member);
      if (other !== undefined) {
        throw new ProjectFormatError(path, `is already in the match set "${other}"`);
      }
      members.add(member);
      setOf.set(member, set.name);
    }
  }
}

function readProject(value: unknown): Project {
  const r = new Reader(value, "$");
  const schemaVersion = r.integer("schemaVersion");
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new ProjectFormatError("$.schemaVersion", `unsupported schema version ${schemaVersion}`);
  }
  const project: Project = {
    schemaVersion: 1,
    name: r.string("name"),
    units: r.oneOf("units", ["imperial", "metric"] as const),
    params: r.array("params", readParam),
    stock: r.array("stock", readStock),
    parts: r.array("parts", readPartDef),
    instances: r.array("instances", readInstance),
    patterns: r.array("patterns", readPattern),
    joints: r.array("joints", readJoint),
    matchSets: r.array("matchSets", readMatchSet),
    structures: r.array("structures", readStructure),
  };
  const planing = r.optionalInteger("planingAllowance", 0, MAX_LENGTH);
  if (planing !== undefined) project.planingAllowance = planing;
  r.done();
  checkIntegrity(project);
  return project;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Orders by Unicode code point (not UTF-16 unit), as ADR 012, decision D3 specifies. */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, (ch) => ch.codePointAt(0) ?? 0);
  const right = Array.from(b, (ch) => ch.codePointAt(0) ?? 0);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

/**
 * JSON with keys in code-point order, 2-space indent and no trailing newline. Written by hand
 * because a JavaScript object always lists integer-like keys first, whatever order they were set.
 */
function canonicalJson(value: Json, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = `${indent}  `;
    return `[\n${value.map((v) => `${inner}${canonicalJson(v, inner)}`).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as { [key: string]: Json };
    const keys = Object.keys(record).sort(compareCodePoints);
    if (keys.length === 0) return "{}";
    const inner = `${indent}  `;
    const lines = keys.map(
      (key) => `${inner}${JSON.stringify(key)}: ${canonicalJson(record[key] as Json, inner)}`,
    );
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * Checks any value against the file schema (shape, whole-number lengths, unique ids, resolvable
 * references) and returns a validated copy. Callers should use the copy, never the original, so
 * that what was checked is exactly what is read.
 */
export function validateProject(
  value: unknown,
):
  | { project: Project; problem?: undefined }
  | { project?: undefined; problem: ProjectFormatError } {
  try {
    const clone = JSON.parse(JSON.stringify(value)) as unknown;
    return { project: readProject(clone) };
  } catch (error) {
    if (error instanceof ProjectFormatError) return { problem: error };
    if (error instanceof RangeError) {
      return {
        problem: new ProjectFormatError("$", "the project is nested too deeply to be read"),
      };
    }
    // Anything else came from reading the caller's value (a getter that throws, a proxy), which
    // is bad input, not a fault in Kerf.
    return { problem: new ProjectFormatError("$", "the project cannot be read as plain data") };
  }
}

/**
 * Canonical project.json text. Validates first, so a float or stray field can never be saved.
 * Throws ProjectFormatError.
 */
export function serializeProject(project: Project): string {
  const checked = validateProject(project);
  if (checked.problem) throw checked.problem;
  // What is saved is intent: structures, openings and hand-made or detached parts. Generated parts,
  // placements, patterns, joints and match sets are re-derived on load. A hand-made object that
  // points at a generated board cannot be saved (the board is not in the file), so say so.
  const [stranded] = strandedReferences(checked.project);
  if (stranded) {
    throw new ProjectFormatError(
      stranded,
      "refers to a board the form generates, which is not saved; detach that board first so it becomes your own",
    );
  }
  return `${canonicalJson(withoutGenerated(checked.project) as unknown as Json)}\n`;
}

/** Reads project.json text, migrating older schema versions forward. Throws ProjectFormatError. */
export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectFormatError("$", "not valid JSON");
  }
  return readProject(migrate(raw));
}

/** Forward-only migrations. Version 1 is current, so there is nothing to migrate yet. */
function migrate(raw: unknown): unknown {
  if (typeof raw === "object" && raw !== null && "schemaVersion" in raw) {
    const version = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof version === "number" && version > CURRENT_SCHEMA_VERSION) {
      throw new ProjectFormatError(
        "$.schemaVersion",
        `this file was saved by a newer version of Kerf (schema ${version})`,
      );
    }
  }
  return raw;
}
