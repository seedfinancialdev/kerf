// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// project.json: strict reading and canonical writing (Domain model v0, "Invariants", "`.kerf` file").
//
// - Every saved length is an integer; floats are rejected.
// - Unknown keys are rejected, so load → save is byte-identical.
// - Canonical form: keys sorted by code point, 2-space indent, trailing newline.
// - Older schema versions migrate forward on load; the app never writes an older version.

import { isOrientationIndex } from "./solve/orientation";
import type {
  EdgeRef,
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
      throw new ProjectFormatError(this.at(key), `expected a value from ${min} to ${max}`);
    }
    return value;
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

  /** A map of string keys to string (or boolean when allowed) values. */
  record<T extends string | boolean>(
    key: string,
    accepts: (v: unknown) => v is T,
    description: string,
  ): Record<string, T> {
    const value = this.take(key);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ProjectFormatError(this.at(key), "expected an object");
    }
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!accepts(v))
        throw new ProjectFormatError(`${this.at(key)}.${k}`, `expected ${description}`);
      out[k] = v;
    }
    return out;
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
    thickness: r.integer("thickness", 1),
    allowance: { length: 0, width: 0 },
  };

  const sheet = r.optionalObject("sheet");
  if (sheet) {
    stock.sheet = {
      length: sheet.integer("length", 1),
      width: sheet.integer("width", 1),
      grain: sheet.oneOf("grain", ["along-length", "none"] as const),
    };
    sheet.done();
  }

  const solid = r.optionalObject("solid");
  if (solid) {
    stock.solid = {
      standardLengths: solid.array("standardLengths", (item, p) => {
        if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 1) {
          throw new ProjectFormatError(p, "expected a whole number of units");
        }
        return item;
      }),
      maxWidth: solid.integer("maxWidth", 1),
    };
    solid.done();
  }

  const allowance = r.object("allowance");
  stock.allowance = {
    length: allowance.integer("length", 0),
    width: allowance.integer("width", 0),
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
  r.done();
  return joint;
}

function readOpening(value: unknown, path: string): Opening {
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
  opening.children = r.array("children", readOpening);
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
  r.done();
  return project;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      out[key] = sortKeys(value[key] as Json);
    }
    return out;
  }
  return value;
}

/**
 * Canonical project.json text. Validates first, so a float or stray field can never be saved.
 * Throws ProjectFormatError.
 */
export function serializeProject(project: Project): string {
  const valid = readProject(JSON.parse(JSON.stringify(project)) as unknown);
  return `${JSON.stringify(sortKeys(valid as unknown as Json), null, 2)}\n`;
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
