// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Solve pipeline steps 1-3 (Domain model v0, "Solve pipeline"):
//   1. Parameters   2. Parts   3. Instances and patterns
// Joints, validation and outputs are M2.
//
// Rules implemented here:
// - Every expression evaluates in exact rationals; a length result snaps to the grid once.
// - A referenced value is the snapped result of the field it names ("what you see is what
//   you use"); counts and ratios are not snapped.
// - A dependency cycle is an error that names every member.

import { ExpressionError } from "../expr/errors";
import { evaluateQuantity, type Quantity, type Scope } from "../expr/evaluate";
import { type Node, parseExpression, partKey, referencesOf, slug, stockKey } from "../expr/parser";
import { snapToGrid, type UnitSystem } from "../length";
import type { Diagnostic } from "../outputs";
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
import type { Id, Instance, Len, Param, PartDef, Pattern, Project } from "../types";
import { extentOf, isOrientationIndex } from "./orientation";

export interface SolvedPart {
  id: Id;
  name: string;
  stock: Id;
  length: Len;
  width: Len;
  thickness: Len;
  grainLocked: boolean;
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
  partId?: Id;
  node?: Node;
  refs: string[];
  state: "pending" | "done" | "failed";
  result?: Quantity;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["stock", "min", "max", "round", "floor", "ceil"]);

class Solver {
  readonly diagnostics: Diagnostic[] = [];
  private readonly fields = new Map<string, Field>();
  private readonly leaves = new Map<string, Quantity>();
  private readonly fieldOrder: string[] = [];
  readonly scope: Record<string, Quantity> = {};

  constructor(
    private readonly project: Project,
    private readonly units: UnitSystem,
  ) {}

  error(rule: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.diagnostics.push({ severity: "error", rule, message, ...extra });
  }

  // ───────── Step 1 and 2: parameters and part sizes ─────────

  solveFields(): { params: Record<string, Quantity>; parts: SolvedPart[] } {
    this.collectStock();
    this.collectParams();
    this.collectParts();
    this.parseAll();
    this.failCycles();
    for (const key of this.fieldOrder) this.resolve(key);

    const params: Record<string, Quantity> = {};
    for (const param of this.project.params) {
      const field = this.fields.get(param.name);
      if (field?.result && field.partId === undefined && field.state === "done") {
        params[param.name] = field.result;
      }
    }

    return { params, parts: this.assembleParts() };
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

  private collectParams(): void {
    for (const param of this.project.params) this.addParam(param);
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
      if (name === "" || seen.has(name)) {
        this.error("duplicate-name", `Two parts are named "${part.name}".`, {
          part: part.id,
          field: part.name,
        });
        continue;
      }
      seen.add(name);

      const stock = stockById.get(part.stock);
      if (!stock) {
        this.error("dangling-reference", `"${part.name}" uses stock that does not exist.`, {
          part: part.id,
          field: part.name,
        });
        continue;
      }

      this.addPartField(part, "length", part.length);
      this.addPartField(part, "width", part.width);
      if (part.thickness === undefined) {
        const key = partKey(part.name, "thickness");
        this.scope[key] = { value: rational(BigInt(stock.thickness)), kind: "length" };
        this.addField({
          key,
          label: `${part.name} thickness`,
          source: "",
          expect: "length",
          partId: part.id,
          refs: [],
          state: "done",
          result: this.scope[key],
        });
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
      partId: part.id,
      refs: [],
      state: "pending",
    });
  }

  private addField(field: Field): void {
    this.fields.set(field.key, field);
    this.fieldOrder.push(field.key);
  }

  private parseAll(): void {
    for (const field of this.fields.values()) {
      if (field.state !== "pending") continue;
      try {
        field.node = parseExpression(field.source);
        field.refs = referencesOf(field.node);
      } catch (error) {
        this.reportExpressionError(field, error);
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
    let counter = 0;
    const order = new Map(this.fieldOrder.map((key, i) => [key, i]));

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
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          members.push(member);
        } while (member !== key);

        const selfLoop = members.length === 1 && field?.refs.includes(key) === true;
        if (members.length > 1 || selfLoop) this.reportCycle(members, order);
      }
    };

    for (const key of this.fieldOrder) if (!index.has(key)) visit(key);
  }

  private reportCycle(members: string[], order: Map<string, number>): void {
    const sorted = [...members].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
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

  /** Evaluates a field after everything it refers to. Returns null when it cannot be solved. */
  private resolve(key: string): Quantity | null {
    const leaf = this.leaves.get(key);
    if (leaf) return leaf;

    const field = this.fields.get(key);
    if (!field) return null;
    if (field.state === "done") return field.result ?? null;
    if (field.state === "failed" || !field.node) return null;

    field.state = "failed"; // guards against re-entry; reset on success
    const scope: Record<string, Quantity> = {};
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
      else scope[ref] = dep;
    }
    if (!ok) return null;

    const result = this.evaluate(field.source, scope, field.label, field.expect, field.partId);
    if (result === null) return null;

    field.result = result;
    field.state = "done";
    this.scope[key] = result;
    return result;
  }

  /** Evaluates, checks the kind, and snaps lengths. Reports on failure and returns null. */
  private evaluate(
    source: string,
    scope: Scope,
    label: string,
    expect: FieldKind,
    part?: Id,
  ): Quantity | null {
    try {
      const raw = evaluateQuantity(source, scope);
      return this.coerce(raw, expect, label, part);
    } catch (error) {
      this.reportExpressionError({ label, partId: part, source }, error);
      return null;
    }
  }

  private coerce(raw: Quantity, expect: FieldKind, label: string, part?: Id): Quantity | null {
    const mismatch = (wanted: string): null => {
      this.error("type-mismatch", `${label} must be ${wanted}.`, { part, field: label });
      return null;
    };

    if (expect === "length") {
      if (raw.kind !== "length") return mismatch("a length (add a unit such as in or mm)");
      return { value: rational(BigInt(snapToGrid(raw.value, this.units))), kind: "length" };
    }
    if (expect === "count") {
      if (raw.kind === "length" || !isInteger(raw.value) || raw.value.num < 0n) {
        return mismatch("a whole number of zero or more");
      }
      return { value: raw.value, kind: "count" };
    }
    if (raw.kind === "length") return mismatch("a plain number or ratio, not a length");
    return { value: raw.value, kind: raw.kind === "count" ? "count" : "ratio" };
  }

  private reportExpressionError(
    where: { label: string; partId?: Id; source: string },
    error: unknown,
  ): void {
    if (error instanceof ExpressionError) {
      this.error("expression-syntax", `${where.label}: ${error.message}.`, {
        part: where.partId,
        field: where.label,
      });
      return;
    }
    throw error;
  }

  private assembleParts(): SolvedPart[] {
    const parts: SolvedPart[] = [];
    for (const def of this.project.parts) {
      const length = this.fields.get(partKey(def.name, "length"));
      const width = this.fields.get(partKey(def.name, "width"));
      const thickness = this.fields.get(partKey(def.name, "thickness"));
      if (
        length?.state !== "done" ||
        width?.state !== "done" ||
        thickness?.state !== "done" ||
        !length.result ||
        !width.result ||
        !thickness.result ||
        length.partId !== def.id
      ) {
        continue;
      }
      parts.push({
        id: def.id,
        name: def.name,
        stock: def.stock,
        length: toSafeInteger(length.result.value),
        width: toSafeInteger(width.result.value),
        thickness: toSafeInteger(thickness.result.value),
        grainLocked: def.grainLocked,
      });
    }
    return parts;
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

    const known = new Set(this.project.instances.map((i) => i.id));
    for (const pattern of this.project.patterns) {
      if (!known.has(pattern.source)) {
        this.error("dangling-reference", "A pattern repeats an instance that does not exist.", {
          field: pattern.id,
        });
      }
    }

    const out: SolvedInstance[] = [];
    for (const instance of this.project.instances) {
      const part = partById.get(instance.def);
      if (!part) {
        if (!this.project.parts.some((p) => p.id === instance.def)) {
          this.error(
            "dangling-reference",
            `"${instance.name ?? instance.id}" uses a part that does not exist.`,
            {
              field: instance.name ?? instance.id,
            },
          );
        }
        continue; // the part itself failed; its error is already reported
      }
      if (!isOrientationIndex(instance.orientation)) {
        this.error(
          "invalid-orientation",
          `"${instance.name ?? part.name}" has an orientation outside 0-23.`,
          {
            field: instance.name ?? part.name,
          },
        );
        continue;
      }
      const pattern = patternBySource.get(instance.id);
      if (pattern) out.push(...this.expandPattern(instance, part, pattern));
      else {
        const placed = this.place(instance, part, instance.name ?? part.name);
        if (placed) out.push(placed);
      }
    }
    return out;
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
      coords.push(toSafeInteger(q.value));
    }
    return { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
  }

  /** Evaluates an expression against all solved fields (instances, patterns). */
  private evaluateOutside(source: string, label: string, expect: FieldKind): Quantity | null {
    let node: Node;
    try {
      node = parseExpression(source);
    } catch (error) {
      this.reportExpressionError({ label, source }, error);
      return null;
    }
    const scope: Record<string, Quantity> = {};
    let ok = true;
    for (const ref of referencesOf(node)) {
      const value = this.leaves.get(ref) ?? this.scope[ref];
      if (value) {
        scope[ref] = value;
      } else if (this.fields.has(ref) || this.leaves.has(ref)) {
        ok = false; // failed upstream; already reported
      } else {
        this.error("unknown-reference", `${label}: there is nothing called "${ref}".`, {
          field: label,
        });
        ok = false;
      }
    }
    return ok ? this.evaluate(source, scope, label, expect) : null;
  }

  private place(
    instance: Instance,
    part: SolvedPart,
    name: string,
    override?: Partial<{ x: Len; y: Len; z: Len }>,
    pattern?: { id: Id; index: number },
  ): SolvedInstance | null {
    const position = this.position(instance, name);
    if (!position) return null;
    const extent = extentOf(instance.orientation, part);
    const placed: SolvedInstance = {
      id: pattern ? `${pattern.id}:${pattern.index}` : instance.id,
      def: part.id,
      name,
      position: { ...position, ...override },
      extent,
      orientation: instance.orientation,
      mirrored: instance.mirrored,
    };
    if (pattern) placed.pattern = pattern;
    return placed;
  }

  private expandPattern(instance: Instance, part: SolvedPart, pattern: Pattern): SolvedInstance[] {
    const label = `${instance.name ?? part.name} pattern`;
    const countQ = this.evaluateOutside(pattern.count, `${label} count`, "count");
    if (!countQ) return [];
    const count = toSafeInteger(countQ.value);
    if (count < 1) {
      this.error("invalid-count", `${label} count must be at least 1.`, {
        field: `${label} count`,
      });
      return [];
    }

    const base = this.place(instance, part, instance.name ?? part.name);
    if (!base) return [];
    const axis = pattern.axis;
    const extent = base.extent[axis];
    const baseName = instance.name ?? part.name;
    const members: SolvedInstance[] = [];

    const offsetFor = this.offsets(pattern, label, count, extent, base.position[axis]);
    if (!offsetFor) return [];

    for (let i = 0; i < count; i += 1) {
      const member = this.place(
        instance,
        part,
        `${baseName} ${i + 1}`,
        { [axis]: offsetFor(i) },
        { id: pattern.id, index: i },
      );
      if (member) members.push(member);
    }
    return members;
  }

  /** Position along the pattern axis for each member index. */
  private offsets(
    pattern: Pattern,
    label: string,
    count: number,
    extent: Len,
    base: Len,
  ): ((i: number) => Len) | null {
    if (pattern.spacing.mode === "fixed") {
      const step = this.evaluateOutside(pattern.spacing.step, `${label} step`, "length");
      if (!step) return null;
      const stepLen = toSafeInteger(step.value);
      return (i) => base + i * stepLen;
    }

    const from = this.evaluateOutside(pattern.spacing.from, `${label} from`, "length");
    const to = this.evaluateOutside(pattern.spacing.to, `${label} to`, "length");
    if (!from || !to) return null;
    // D2: from/to is the span being divided; the air gaps between members are equal.
    const span = sub(to.value, from.value);
    const gap = div(
      sub(span, mul(fromInteger(count), fromInteger(extent))),
      fromInteger(count + 1),
    );
    const origin: Rational = from.value;
    return (i) =>
      snapToGrid(
        add(add(origin, mul(fromInteger(i + 1), gap)), mul(fromInteger(i), fromInteger(extent))),
        this.units,
      );
  }
}

/** Steps 1-3 of the solve pipeline. Never throws for bad project data; it reports diagnostics. */
export function solveModel(project: Project): SolvedModel {
  const solver = new Solver(project, project.units);
  const { params, parts } = solver.solveFields();
  const instances = solver.expandInstances(parts);
  return { diagnostics: solver.diagnostics, params, parts, instances };
}
