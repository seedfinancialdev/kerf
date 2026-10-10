// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline steps 1-3 (Domain model v0, "Solve pipeline"):
//   1. Parameters   2. Parts   3. Instances and patterns
// Joints, validation and outputs belong to later stages (M2); this function does not apply
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
import { LengthRangeError, MAX_LENGTH, snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic } from "../outputs";
import { projectProblem } from "../project-file";
import { add, div, fromInteger, isInteger, mul, rational, sub, toSafeInteger } from "../rational";
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

  private error(rule: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.diagnostics.push({ severity: "error", rule, message, ...extra });
  }

  private warn(rule: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.diagnostics.push({ severity: "warning", rule, message, ...extra });
  }

  // ───────── Steps 1 and 2: parameters and part sizes ─────────

  solveFields(): { params: Record<string, Quantity>; parts: SolvedPart[] } {
    this.collectStock();
    for (const param of this.project.params) this.addParam(param);
    this.collectParts();
    this.parseAll();
    this.failCycles();
    for (const key of this.order) this.resolve(key);

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
        const key = partKey(part.name, "thickness");
        const exact: Quantity = { value: rational(BigInt(stock.thickness)), kind: "length" };
        this.exact.set(key, exact);
        this.addField({
          key,
          label: `${part.name} thickness`,
          source: "",
          expect: "length",
          dimension: true,
          partId: part.id,
          refs: [],
          state: "done",
          exact,
          value: exact,
        });
        if (stock.thickness <= 0) {
          this.error("invalid-dimension", `${part.name} thickness must be greater than zero.`, {
            part: part.id,
            field: `${part.name} thickness`,
          });
        }
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

  /** Strongly connected components with more than one member (or a self-reference). */
  private failCycles(): void {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const position = new Map(this.order.map((key, i) => [key, i]));
    let counter = 0;

    const visit = (key: string): void => {
      index.set(key, counter);
      low.set(key, counter);
      counter += 1;
      stack.push(key);
      onStack.add(key);

      const field = this.fields.get(key);
      for (const ref of field?.refs ?? []) {
        if (!this.fields.has(ref)) continue;
        if (!index.has(ref)) {
          visit(ref);
          low.set(key, Math.min(low.get(key) ?? 0, low.get(ref) ?? 0));
        } else if (onStack.has(ref)) {
          low.set(key, Math.min(low.get(key) ?? 0, index.get(ref) ?? 0));
        }
      }

      if (low.get(key) === index.get(key)) {
        const members: string[] = [];
        for (;;) {
          const member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          members.push(member);
          if (member === key) break;
        }
        const selfLoop = members.length === 1 && field?.refs.includes(key) === true;
        if (members.length > 1 || selfLoop) this.reportCycle(members, position);
      }
    };

    for (const key of this.order) if (!index.has(key)) visit(key);
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

  /** Solves a field after everything it refers to. Returns null when it cannot be solved. */
  private resolve(key: string): Quantity | null {
    const leaf = this.leaves.get(key);
    if (leaf) return leaf;

    const field = this.fields.get(key);
    if (!field) return null;
    if (field.state === "done") return field.exact ?? null;
    if (field.state === "failed" || !field.node) return null;

    field.state = "failed"; // guards against re-entry; replaced on success
    const scope: Array<[string, Quantity]> = [];
    let ok = true;
    for (const ref of field.refs) {
      if (!this.leaves.has(ref) && !this.fields.has(ref)) {
        this.error("unknown-reference", `${field.label}: there is nothing called "${ref}".`, {
          part: field.partId,
          field: field.label,
        });
        ok = false;
        continue;
      }
      const dep = this.resolve(ref);
      if (dep === null) ok = false;
      else scope.push([ref, dep]);
    }
    if (!ok) return null;

    const solved = this.solveExpression(
      field.source,
      scope,
      field.label,
      field.expect,
      field.partId,
    );
    if (solved === null) return null;
    if (field.dimension && solved.value.value.num <= 0n) {
      this.error(
        "invalid-dimension",
        `${field.label} must be greater than zero (it is zero or negative after rounding to the grid).`,
        { part: field.partId, field: field.label },
      );
      return null;
    }

    field.exact = solved.exact;
    field.value = solved.value;
    field.state = "done";
    this.exact.set(key, solved.exact);
    return solved.exact;
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
    const scalar: Quantity = { value: raw.value, kind: raw.kind === "count" ? "count" : "ratio" };
    return { exact: scalar, value: scalar };
  }

  private reportProblem(where: { label: string; partId?: Id }, error: unknown): void {
    if (error instanceof ExpressionError) {
      this.error("expression-syntax", `${where.label}: ${error.message}.`, {
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
        if (placed) out.push(placed);
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

  private position(instance: Instance, label: string): { x: Len; y: Len; z: Len } | null {
    const coords: Len[] = [];
    for (const axis of ["x", "y", "z"] as const) {
      const q = this.evaluateOutside(
        instance.position[axis],
        `${label} position ${axis}`,
        "length",
      );
      if (!q) return null;
      coords.push(toSafeInteger(q.value.value));
    }
    return { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
  }

  private place(instance: Instance, part: SolvedPart, name: string): SolvedInstance | null {
    const position = this.position(instance, name);
    if (!position) return null;
    return {
      id: instance.id,
      def: part.id,
      name,
      position,
      extent: extentOf(instance.orientation, part),
      orientation: instance.orientation,
      mirrored: instance.mirrored,
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

    const base = this.place(instance, part, name);
    if (!base) return [];
    const axis = pattern.axis;
    const positions = this.positionsAlong(
      pattern,
      label,
      count,
      base.extent[axis],
      base.position[axis],
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
    base: Len,
  ): Len[] | null {
    const inRange = (n: number): boolean => Math.abs(n) <= MAX_LENGTH;

    if (pattern.spacing.mode === "fixed") {
      const stepQ = this.evaluateOutside(pattern.spacing.step, `${label} step`, "length");
      if (!stepQ) return null;
      const step = toSafeInteger(stepQ.value.value);
      if (step <= 0) {
        this.error("invalid-pattern", `${label} step must be greater than zero.`, {
          field: `${label} step`,
        });
        return null;
      }
      const last = base + (count - 1) * step;
      if (!inRange(last)) {
        this.error("out-of-range", `${label} runs past the supported size.`, { field: label });
        return null;
      }
      return Array.from({ length: count }, (_, i) => base + i * step);
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

/**
 * Steps 1-3 of the solve pipeline. Never throws: problems come back as diagnostics, and an
 * invalid project (wrong shape, repeated ids, dangling references) yields one "invalid-project"
 * error and an empty model.
 */
export function solveModel(project: Project): SolvedModel {
  const problem = projectProblem(project);
  if (problem) {
    return {
      diagnostics: [
        {
          severity: "error",
          rule: "invalid-project",
          message: `The project file is not valid: ${problem.message}.`,
          field: problem.path,
        },
      ],
      params: {},
      parts: [],
      instances: [],
    };
  }

  const solver = new Solver(project, project.units);
  try {
    const { params, parts } = solver.solveFields();
    const instances = solver.expandInstances(parts);
    return { diagnostics: solver.diagnostics, params, parts, instances };
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      diagnostics: [
        ...solver.diagnostics,
        {
          severity: "error",
          rule: "internal-error",
          message: `Kerf could not finish solving this project (${reason}). This is a bug; please report it.`,
        },
      ],
      params: {},
      parts: [],
      instances: [],
    };
  }
}
