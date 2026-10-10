// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline steps 1-3 (Domain model v0, "Solve pipeline"):
//   1. Parameters   2. Parts   3. Instances and patterns
// Joints, validation and outputs are steps 4-6 (see pipeline.ts); this function does not apply
// joints, match sets or structures, and says so in its name.
//
// Rules (ADR 012):
// - Expressions evaluate in exact rationals. A field's result snaps to the grid once, at the
//   end; other fields that refer to it use the exact value, not the snapped one.
// - Bad data produces diagnostics, never exceptions. Anything that goes wrong inside the solver
//   itself is reported as an "internal-error" diagnostic rather than thrown.
// - A dependency cycle is one error that names every member.

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity } from "../expr/evaluate";
import { type Node, parseExpression, partKey, referencesOf, slug, stockKey } from "../expr/parser";
import { LengthRangeError, snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic } from "../outputs";
import { validateProject } from "../project-file";
import {
  add,
  div,
  fromInteger,
  isInteger,
  mul,
  type Rational,
  rational,
  sub,
  toSafeInteger,
} from "../rational";
import type { EdgeRef, Id, Instance, Len, Param, PartDef, Pattern, Project } from "../types";
import { extentOf, isOrientationIndex } from "./orientation";

/** Most members one pattern may expand to. */
export const MAX_PATTERN_COUNT = 10_000;

export interface SolvedOp {
  id: Id;
  type: "roundover";
  edges: EdgeRef[];
  radius: Len;
}

export interface SolvedPart {
  id: Id;
  name: string;
  stock: Id;
  length: Len;
  width: Len;
  thickness: Len;
  grainLocked: boolean;
  ops: SolvedOp[];
}

/** One concrete placement. Pattern members replace their source instance. */
export interface SolvedInstance {
  /** The instance id, or `<patternId>:<index>` for a pattern member. */
  id: Id;
  def: Id;
  name: string;
  /** Minimum corner of the part's bounding box, in the parent frame. */
  position: { x: Len; y: Len; z: Len };
  /** Bounding-box size along the parent frame's X, Y and Z. */
  extent: { x: Len; y: Len; z: Len };
  orientation: number;
  mirrored: boolean;
  pattern?: { id: Id; index: number };
}

export interface SolvedModel {
  diagnostics: Diagnostic[];
  /** Evaluated parameters by name; lengths are snapped integers in internal units. */
  params: Record<string, Quantity>;
  /**
   * Exact value of every name an expression may use: parameters, part properties
   * (`side.thickness`) and stock thickness. Later stages evaluate joint parameters against this.
   */
  scope: Record<string, Quantity>;
  parts: SolvedPart[];
  instances: SolvedInstance[];
}

type FieldKind = "length" | "count" | "ratio";

interface Field {
  key: string;
  label: string;
  source: string;
  expect: FieldKind;
  /** Set for a part's length, width or thickness: must come out greater than zero. */
  dimension?: boolean;
  partId?: Id;
  node?: Node;
  refs: string[];
  state: "pending" | "done" | "failed";
  /** Used by other fields: exact, never snapped. */
  exact?: Quantity;
  /** What is shown and stored: lengths snapped to the grid. */
  value?: Quantity;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["stock", "min", "max", "round", "floor", "ceil", "__proto__"]);

class Solver {
  readonly diagnostics: Diagnostic[] = [];
  private readonly fields = new Map<string, Field>();
  private readonly leaves = new Map<string, Quantity>();
  private readonly order: string[] = [];
  /** Exact values of every solved field, by reference key. */
  private readonly exact = new Map<string, Quantity>();

  constructor(
    private readonly project: Project,
    private readonly units: UnitSystem,
  ) {}

  private error(
    rule: string,
    message: string,
    extra: Partial<Omit<Diagnostic, "severity" | "rule" | "message">> = {},
  ): void {
    this.diagnostics.push({ severity: "error", rule, message, ...extra });
  }

  private warn(
    rule: string,
    message: string,
    extra: Partial<Omit<Diagnostic, "severity" | "rule" | "message">> = {},
  ): void {
    this.diagnostics.push({ severity: "warning", rule, message, ...extra });
  }

  // ───────── Steps 1 and 2: parameters and part sizes ─────────

  /** Exact value of every solved name, for evaluating joint parameters later. */
  exactScope(): Record<string, Quantity> {
    return Object.fromEntries([...this.leaves, ...this.exact]);
  }

  solveFields(): { params: Record<string, Quantity>; parts: SolvedPart[] } {
    this.collectStock();
    for (const param of this.project.params) this.addParam(param);
    this.collectParts();
    this.parseAll();
    for (const key of this.dependencyOrder()) this.solveField(key);

    const entries: Array<[string, Quantity]> = [];
    for (const param of this.project.params) {
      const field = this.fields.get(param.name);
      if (field?.state === "done" && field.value && field.partId === undefined) {
        entries.push([param.name, field.value]);
      }
    }
    return { params: Object.fromEntries(entries), parts: this.assembleParts() };
  }

  private collectStock(): void {
    for (const stock of this.project.stock) {
      const key = stockKey(stock.name, "thickness");
      if (this.leaves.has(key)) {
        this.error("duplicate-name", `Two stock entries are named "${stock.name}".`, {
          field: stock.name,
        });
        continue;
      }
      this.leaves.set(key, { value: rational(BigInt(stock.thickness)), kind: "length" });
    }
  }

  private addParam(param: Param): void {
    if (!IDENTIFIER.test(param.name) || RESERVED.has(param.name)) {
      this.error("invalid-name", `"${param.name}" cannot be used as a parameter name.`, {
        field: param.name,
      });
      return;
    }
    if (this.fields.has(param.name)) {
      this.error("duplicate-name", `Two parameters are named "${param.name}".`, {
        field: param.name,
      });
      return;
    }
    this.addField({
      key: param.name,
      label: param.name,
      source: param.expr,
      expect: param.kind,
      refs: [],
      state: "pending",
    });
  }

  private collectParts(): void {
    const stockById = new Map(this.project.stock.map((s) => [s.id, s]));
    const seen = new Set<string>();

    for (const part of this.project.parts) {
      const name = slug(part.name);
      if (name === "") {
        this.error(
          "invalid-name",
          `"${part.name}" needs at least one letter or digit in its name.`,
          { part: part.id, field: part.name },
        );
        continue;
      }
      if (seen.has(name)) {
        this.error("duplicate-name", `Two parts are named "${part.name}".`, {
          part: part.id,
          field: part.name,
        });
        continue;
      }
      seen.add(name);

      const stock = stockById.get(part.stock);
      if (!stock) throw new Error(`unreachable: part "${part.name}" has no stock`);

      this.addPartField(part, "length", part.length);
      this.addPartField(part, "width", part.width);
      if (part.thickness === undefined) {
        const field: Field = {
          key: partKey(part.name, "thickness"),
          label: `${part.name} thickness`,
          source: "",
          expect: "length",
          dimension: true,
          partId: part.id,
          refs: [],
          state: "pending",
        };
        this.addField(field);
        this.conclude(field, { value: rational(BigInt(stock.thickness)), kind: "length" });
      } else {
        this.addPartField(part, "thickness", part.thickness);
      }
    }
  }

  private addPartField(part: PartDef, property: string, source: string): void {
    this.addField({
      key: partKey(part.name, property),
      label: `${part.name} ${property}`,
      source,
      expect: "length",
      dimension: true,
      partId: part.id,
      refs: [],
      state: "pending",
    });
  }

  private addField(field: Field): void {
    this.fields.set(field.key, field);
    this.order.push(field.key);
  }

  private parseAll(): void {
    for (const field of this.fields.values()) {
      if (field.state !== "pending") continue;
      try {
        field.node = parseExpression(field.source);
        field.refs = referencesOf(field.node);
      } catch (error) {
        this.reportProblem(field, error);
        field.state = "failed";
      }
    }
  }

  /**
   * Fields in dependency order (what a field refers to comes before it), found with an iterative
   * Tarjan pass, so a chain of any length is safe. Strongly connected components with more than
   * one member, or a self-reference, are reported as one cycle and marked failed.
   */
  private dependencyOrder(): string[] {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const position = new Map(this.order.map((key, i) => [key, i]));
    const result: string[] = [];
    let counter = 0;

    const successors = (key: string): string[] =>
      (this.fields.get(key)?.refs ?? []).filter((ref) => this.fields.has(ref));
    const lowOf = (key: string): number => low.get(key) ?? 0;

    for (const root of this.order) {
      if (index.has(root)) continue;
      const work: Array<{ key: string; next: number; successors: string[] }> = [];
      const enter = (key: string): void => {
        index.set(key, counter);
        low.set(key, counter);
        counter += 1;
        stack.push(key);
        onStack.add(key);
        work.push({ key, next: 0, successors: successors(key) });
      };

      enter(root);
      for (let frame = work.at(-1); frame !== undefined; frame = work.at(-1)) {
        const ref = frame.successors[frame.next];
        if (ref !== undefined) {
          frame.next += 1;
          if (!index.has(ref)) enter(ref);
          else if (onStack.has(ref))
            low.set(frame.key, Math.min(lowOf(frame.key), index.get(ref) ?? 0));
          continue;
        }

        work.pop();
        const parent = work.at(-1);
        if (parent) low.set(parent.key, Math.min(lowOf(parent.key), lowOf(frame.key)));
        if (lowOf(frame.key) !== index.get(frame.key)) continue;

        const members: string[] = [];
        for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
          onStack.delete(member);
          members.push(member);
          if (member === frame.key) break;
        }
        const selfLoop =
          members.length === 1 && this.fields.get(frame.key)?.refs.includes(frame.key);
        if (members.length > 1 || selfLoop) this.reportCycle(members, position);
        result.push(...members);
      }
    }
    return result;
  }

  private reportCycle(members: string[], position: Map<string, number>): void {
    const sorted = [...members].sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    const labels = sorted.map((key) => this.fields.get(key)?.label ?? key);
    for (const key of sorted) {
      const field = this.fields.get(key);
      if (field) field.state = "failed";
    }
    const list = labels.map((label) => `"${label}"`).join(", ");
    this.error(
      "parameter-cycle",
      labels.length === 1
        ? `${list} refers to itself. Give it a fixed value instead.`
        : `${list} depend on each other in a circle. Give one of them a fixed value to break the loop.`,
      { field: labels.join(", ") },
    );
  }

  /** Solves one field. Everything it refers to has already been solved or has failed. */
  private solveField(key: string): void {
    const field = this.fields.get(key);
    if (field?.state !== "pending" || !field.node) return;

    const scope: Array<[string, Quantity]> = [];
    let ok = true;
    for (const ref of field.refs) {
      const leaf = this.leaves.get(ref);
      if (leaf) {
        scope.push([ref, leaf]);
        continue;
      }
      const dependency = this.fields.get(ref);
      if (!dependency) {
        this.error("unknown-reference", `${field.label}: there is nothing called "${ref}".`, {
          part: field.partId,
          field: field.label,
        });
        ok = false;
      } else if (dependency.state === "done" && dependency.exact) {
        scope.push([ref, dependency.exact]);
      } else {
        ok = false; // failed upstream; its own diagnostic says why
      }
    }
    if (!ok) {
      field.state = "failed";
      return;
    }

    try {
      this.conclude(field, evaluateQuantity(field.source, Object.fromEntries(scope)));
    } catch (error) {
      this.reportProblem(field, error);
      field.state = "failed";
    }
  }

  /**
   * Turns a raw value into a field's result: checks its kind, snaps a length once, and requires
   * part dimensions to be greater than zero. Reports and returns false on failure.
   */
  private conclude(field: Field, raw: Quantity): boolean {
    let solved: { exact: Quantity; value: Quantity } | null;
    try {
      solved = this.coerce(raw, field.expect, field.label, field.partId);
    } catch (error) {
      this.reportProblem(field, error);
      field.state = "failed";
      return false;
    }
    if (solved === null) {
      field.state = "failed";
      return false;
    }
    if (field.dimension && solved.value.value.num <= 0n) {
      this.error(
        "invalid-dimension",
        `${field.label} must be greater than zero (it is zero or negative after rounding to the grid).`,
        { part: field.partId, field: field.label },
      );
      field.state = "failed";
      return false;
    }
    field.exact = solved.exact;
    field.value = solved.value;
    field.state = "done";
    this.exact.set(field.key, solved.exact);
    return true;
  }

  /**
   * Evaluates one expression. `exact` is what other fields use; `value` is what is stored
   * (lengths snapped to the grid, once). Reports a diagnostic and returns null on failure.
   */
  private solveExpression(
    source: string,
    scope: ReadonlyArray<[string, Quantity]>,
    label: string,
    expect: FieldKind,
    part?: Id,
  ): { exact: Quantity; value: Quantity } | null {
    try {
      const raw = evaluateQuantity(source, Object.fromEntries(scope));
      return this.coerce(raw, expect, label, part);
    } catch (error) {
      this.reportProblem({ label, partId: part }, error);
      return null;
    }
  }

  private coerce(
    raw: Quantity,
    expect: FieldKind,
    label: string,
    part?: Id,
  ): { exact: Quantity; value: Quantity } | null {
    const mismatch = (wanted: string): null => {
      this.error("type-mismatch", `${label} must be ${wanted}.`, { part, field: label });
      return null;
    };

    if (expect === "length") {
      if (raw.kind !== "length") return mismatch("a length (add a unit such as in or mm)");
      const snapped = snapToGrid(raw.value, this.units);
      return { exact: raw, value: { value: rational(BigInt(snapped)), kind: "length" } };
    }
    if (expect === "count") {
      if (raw.kind === "length" || !isInteger(raw.value) || raw.value.num < 0n) {
        return mismatch("a whole number of zero or more");
      }
      const count: Quantity = { value: raw.value, kind: "count" };
      return { exact: count, value: count };
    }
    if (raw.kind === "length") return mismatch("a plain number or ratio, not a length");
    // A parameter declared as a ratio is a ratio, whatever its expression looks like.
    const ratio: Quantity = { value: raw.value, kind: "ratio" };
    return { exact: ratio, value: ratio };
  }

  private reportProblem(where: { label: string; partId?: Id }, error: unknown): void {
    if (error instanceof ExpressionError) {
      const rule = error.reason === "limit" ? "limit-exceeded" : "expression-syntax";
      this.error(rule, `${where.label}: ${error.message}.`, {
        part: where.partId,
        field: where.label,
      });
    } else if (error instanceof LengthRangeError) {
      this.error("out-of-range", `${where.label}: ${error.message}.`, {
        part: where.partId,
        field: where.label,
      });
    } else {
      throw error;
    }
  }

  private assembleParts(): SolvedPart[] {
    const parts: SolvedPart[] = [];
    for (const def of this.project.parts) {
      const get = (property: string): Field | undefined => {
        const field = this.fields.get(partKey(def.name, property));
        return field?.partId === def.id && field.state === "done" ? field : undefined;
      };
      const length = get("length");
      const width = get("width");
      const thickness = get("thickness");
      if (!length?.value || !width?.value || !thickness?.value) continue;
      parts.push({
        id: def.id,
        name: def.name,
        stock: def.stock,
        length: toSafeInteger(length.value.value),
        width: toSafeInteger(width.value.value),
        thickness: toSafeInteger(thickness.value.value),
        grainLocked: def.grainLocked,
        ops: this.solveOps(def),
      });
    }
    return parts;
  }

  private solveOps(def: PartDef): SolvedOp[] {
    const ops: SolvedOp[] = [];
    for (const op of def.ops) {
      const label = `${def.name} roundover radius`;
      const radius = this.evaluateOutside(op.radius, label, "length", def.id);
      if (!radius) continue;
      const len = toSafeInteger(radius.value.value);
      if (len <= 0) {
        this.error("invalid-dimension", `${label} must be greater than zero.`, {
          part: def.id,
          field: label,
        });
        continue;
      }
      ops.push({ id: op.id, type: op.type, edges: [...op.edges], radius: len });
    }
    return ops;
  }

  // ───────── Step 3: instances and patterns ─────────

  expandInstances(parts: SolvedPart[]): SolvedInstance[] {
    const partById = new Map(parts.map((p) => [p.id, p]));
    const patternBySource = new Map<Id, Pattern>();
    for (const pattern of this.project.patterns) {
      if (patternBySource.has(pattern.source)) {
        this.error("duplicate-pattern", "An instance can only be repeated by one pattern.", {
          field: pattern.id,
        });
        continue;
      }
      patternBySource.set(pattern.source, pattern);
    }

    const out: SolvedInstance[] = [];
    for (const instance of this.project.instances) {
      const part = partById.get(instance.def);
      if (!part) continue; // the part itself failed; its own diagnostic says why
      if (!isOrientationIndex(instance.orientation)) {
        throw new Error("unreachable: orientation is validated when the project is read");
      }
      const name = instance.name ?? part.name;
      if (instance.parent !== undefined) {
        this.warn(
          "not-solved-yet",
          `"${name}" sits inside another assembly; nested placement is not applied yet.`,
          { field: name },
        );
      }
      const pattern = patternBySource.get(instance.id);
      if (pattern) {
        for (const member of this.expandPattern(instance, part, pattern, name)) out.push(member);
      } else {
        const placed = this.place(instance, part, name);
        if (placed) out.push(placed.placed);
      }
    }
    return out;
  }

  /** Evaluates against everything solved so far. Failures upstream are already reported. */
  private evaluateOutside(
    source: string,
    label: string,
    expect: FieldKind,
    part?: Id,
  ): { exact: Quantity; value: Quantity } | null {
    let node: Node;
    try {
      node = parseExpression(source);
    } catch (error) {
      this.reportProblem({ label, partId: part }, error);
      return null;
    }
    const scope: Array<[string, Quantity]> = [];
    let ok = true;
    for (const ref of referencesOf(node)) {
      const value = this.leaves.get(ref) ?? this.exact.get(ref);
      if (value) {
        scope.push([ref, value]);
      } else if (this.fields.has(ref)) {
        ok = false; // failed upstream; already reported
      } else {
        this.error("unknown-reference", `${label}: there is nothing called "${ref}".`, {
          part,
          field: label,
        });
        ok = false;
      }
    }
    return ok ? this.solveExpression(source, scope, label, expect, part) : null;
  }

  /** Position on each axis: snapped for storage, exact for patterns that step from it. */
  private position(
    instance: Instance,
    label: string,
  ): {
    value: { x: Len; y: Len; z: Len };
    exact: { x: Rational; y: Rational; z: Rational };
  } | null {
    const value = { x: 0, y: 0, z: 0 };
    const exact = { x: rational(0n), y: rational(0n), z: rational(0n) };
    for (const axis of ["x", "y", "z"] as const) {
      const q = this.evaluateOutside(
        instance.position[axis],
        `${label} position ${axis}`,
        "length",
      );
      if (!q) return null;
      value[axis] = toSafeInteger(q.value.value);
      exact[axis] = q.exact.value;
    }
    return { value, exact };
  }

  private place(
    instance: Instance,
    part: SolvedPart,
    name: string,
  ): { placed: SolvedInstance; exact: { x: Rational; y: Rational; z: Rational } } | null {
    const position = this.position(instance, name);
    if (!position) return null;
    return {
      exact: position.exact,
      placed: {
        id: instance.id,
        def: part.id,
        name,
        position: position.value,
        extent: extentOf(instance.orientation, part),
        orientation: instance.orientation,
        mirrored: instance.mirrored,
      },
    };
  }

  private expandPattern(
    instance: Instance,
    part: SolvedPart,
    pattern: Pattern,
    name: string,
  ): SolvedInstance[] {
    const label = `${name} pattern`;
    const countQ = this.evaluateOutside(pattern.count, `${label} count`, "count");
    if (!countQ) return [];
    if (countQ.value.value.num < 1n || countQ.value.value.num > BigInt(MAX_PATTERN_COUNT)) {
      this.error(
        "invalid-count",
        `${label} count must be from 1 to ${MAX_PATTERN_COUNT.toLocaleString("en-US")}.`,
        { field: `${label} count` },
      );
      return [];
    }
    const count = toSafeInteger(countQ.value.value);

    const found = this.place(instance, part, name);
    if (!found) return [];
    const base = found.placed;
    const axis = pattern.axis;
    const positions = this.positionsAlong(
      pattern,
      label,
      count,
      base.extent[axis],
      found.exact[axis],
    );
    if (!positions) return [];

    return positions.map((along, index) => ({
      ...base,
      id: `${pattern.id}:${index}`,
      name: `${name} ${index + 1}`,
      position: { ...base.position, [axis]: along },
      pattern: { id: pattern.id, index },
    }));
  }

  /** Position along the pattern axis for every member, or null after reporting a problem. */
  private positionsAlong(
    pattern: Pattern,
    label: string,
    count: number,
    extent: Len,
    base: Rational,
  ): Len[] | null {
    if (pattern.spacing.mode === "fixed") {
      const stepQ = this.evaluateOutside(pattern.spacing.step, `${label} step`, "length");
      if (!stepQ) return null;
      // R1: step from the exact values and snap each member once, so error never accumulates.
      const step = stepQ.exact.value;
      if (step.num <= 0n) {
        this.error("invalid-pattern", `${label} step must be greater than zero.`, {
          field: `${label} step`,
        });
        return null;
      }
      try {
        return Array.from({ length: count }, (_, i) =>
          snapToGrid(add(base, mul(fromInteger(i), step)), this.units),
        );
      } catch (error) {
        this.reportProblem({ label }, error);
        return null;
      }
    }

    const from = this.evaluateOutside(pattern.spacing.from, `${label} from`, "length");
    const to = this.evaluateOutside(pattern.spacing.to, `${label} to`, "length");
    if (!from || !to) return null;

    // D2: from/to is the span being divided; the air gaps between members are equal.
    const span = sub(to.exact.value, from.exact.value);
    const used = mul(fromInteger(count), fromInteger(extent));
    const free = sub(span, used);
    if (free.num < 0n) {
      this.error(
        "pattern-overlap",
        `${label}: ${count} members do not fit between "from" and "to".`,
        { field: label },
      );
      return null;
    }
    const gap = div(free, fromInteger(count + 1));
    try {
      return Array.from({ length: count }, (_, i) =>
        snapToGrid(
          add(
            from.exact.value,
            add(mul(fromInteger(i + 1), gap), mul(fromInteger(i), fromInteger(extent))),
          ),
          this.units,
        ),
      );
    } catch (error) {
      this.reportProblem({ label }, error);
      return null;
    }
  }
}

function describe(error: unknown): string {
  try {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return typeof error === "object" ? "a value that is not an error was thrown" : String(error);
  } catch {
    return "an error that could not be described";
  }
}

const emptyModel = (diagnostics: Diagnostic[]): SolvedModel => ({
  diagnostics,
  params: {},
  scope: {},
  parts: [],
  instances: [],
});

/** The single "invalid-project" diagnostic for a project that failed validation. */
export function invalidProjectModel(path: string, message: string): SolvedModel {
  return emptyModel([
    {
      severity: "error",
      rule: "invalid-project",
      message: `The project file is not valid: ${message}.`,
      field: path,
    },
  ]);
}

/**
 * Steps 1-3 for a project that has already passed `validateProject`. Never throws: anything
 * unexpected is an "internal-error" diagnostic.
 */
export function solveValidatedModel(project: Project): SolvedModel {
  let solver: Solver | undefined;
  try {
    solver = new Solver(project, project.units);
    const { params, parts } = solver.solveFields();
    const instances = solver.expandInstances(parts);
    return {
      diagnostics: solver.diagnostics,
      params,
      scope: solver.exactScope(),
      parts,
      instances,
    };
  } catch (error) {
    return emptyModel([
      ...(solver?.diagnostics ?? []),
      {
        severity: "error",
        rule: "internal-error",
        message: `Kerf could not finish solving this project (${describe(error)}). This is a bug; please report it.`,
      },
    ]);
  }
}

/**
 * Steps 1-3 of the solve pipeline. Never throws: problems come back as diagnostics. A project
 * that is the wrong shape, reuses an id or has a dangling reference yields one "invalid-project"
 * error and an empty model. Solving reads a validated copy, never the object passed in.
 */
export function solveModel(project: Project): SolvedModel {
  try {
    const checked = validateProject(project);
    if (checked.problem) return invalidProjectModel(checked.problem.path, checked.problem.message);
    return solveValidatedModel(checked.project);
  } catch (error) {
    return emptyModel([
      {
        severity: "error",
        rule: "internal-error",
        message: `Kerf could not finish solving this project (${describe(error)}). This is a bug; please report it.`,
      },
    ]);
  }
}
