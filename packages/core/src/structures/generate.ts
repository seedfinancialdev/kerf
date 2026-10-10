// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Structure generators (Domain model v0, "Structures, openings & shop profile"). On every solve a
// structure emits ordinary parts, instances, patterns, joints and match sets, which then flow
// through the same pipeline as hand-made ones. Nothing here changes how a part is solved.
//
// Everything a generator makes carries `source` (its structure and role) and an id derived from
// them (ids.ts). A part the user has edited by hand is `detached`: it, its placements and its
// patterns are kept exactly as saved, and the generator stops regenerating them.

import { evaluateQuantity } from "../expr/evaluate";
import type { Diagnostic } from "../outputs";
import { solveModel } from "../solve/model";
import type {
  GeneratedFrom,
  Id,
  Instance,
  Joint,
  MatchSet,
  Opening,
  PartDef,
  Pattern,
  Project,
  Stock,
  Structure,
} from "../types";
import { generatedId } from "./ids";
import { withoutGenerated } from "./strip";

/** Generated objects, before they are merged into a project. */
interface Generated {
  parts: PartDef[];
  instances: Instance[];
  patterns: Pattern[];
  joints: Joint[];
  matchSets: MatchSet[];
}

const empty = (): Generated => ({
  parts: [],
  instances: [],
  patterns: [],
  joints: [],
  matchSets: [],
});

/** Everything a generator needs to write expressions and make ids. */
class Builder {
  readonly out = empty();
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    readonly structure: Structure,
    private readonly stocks: Map<Id, Stock>,
    private readonly scope: Record<string, unknown>,
  ) {}

  id(key: string): Id {
    return generatedId(this.structure.id, key);
  }

  from(role: string): GeneratedFrom {
    return { structure: this.structure.id, role };
  }

  /** The stock named by an option, or undefined (with a diagnostic) when it is not there. */
  stock(option: string): Stock | undefined {
    const id = this.structure.options[option];
    const found = typeof id === "string" ? this.stocks.get(id) : undefined;
    if (!found) {
      this.problem(
        "structure-stock-missing",
        `The ${this.structure.type} form needs a stock chosen for "${option}", and none is set.`,
        option,
      );
    }
    return found;
  }

  /** `stock["name"].thickness`, the way the expression language refers to it. */
  thickness(stock: Stock): string {
    return `stock["${stock.name}"].thickness`;
  }

  option(key: string): string | undefined {
    const v = this.structure.options[key];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  }

  flag(key: string): boolean {
    return this.structure.options[key] === true;
  }

  problem(rule: string, message: string, field: string): void {
    this.diagnostics.push({
      severity: "error",
      rule,
      message,
      field,
    });
  }

  warning(rule: string, message: string, field: string): void {
    this.diagnostics.push({ severity: "warning", rule, message, field });
  }

  /** A count the form gives as an expression, evaluated now because it decides how many parts. */
  count(expr: string, field: string): number {
    try {
      const q = evaluateQuantity(expr, this.scope as never);
      if (q.kind === "count" && q.value.den === 1n && q.value.num >= 0n && q.value.num <= 64n) {
        return Number(q.value.num);
      }
    } catch {
      // reported below
    }
    this.problem(
      "invalid-count",
      `${field} must be a whole number from 0 to 64 (it decides how many boards are made).`,
      field,
    );
    return 0;
  }

  part(
    role: string,
    key: string,
    def: Omit<PartDef, "id" | "source" | "grainLocked" | "ops"> & {
      ops?: PartDef["ops"];
    },
  ): PartDef {
    const part: PartDef = {
      id: this.id(`part:${key}`),
      grainLocked: true,
      ops: [],
      ...def,
      source: this.from(role),
    };
    this.out.parts.push(part);
    return part;
  }

  instance(
    role: string,
    key: string,
    def: PartDef,
    at: [string, string, string],
    extra: { name?: string; orientation?: number; mirrored?: boolean } = {},
  ): Instance {
    const instance: Instance = {
      id: this.id(`inst:${key}`),
      def: def.id,
      position: { x: at[0], y: at[1], z: at[2] },
      orientation: extra.orientation ?? 0,
      mirrored: extra.mirrored ?? false,
      generatedBy: this.from(role),
      ...(extra.name !== undefined ? { name: extra.name } : {}),
    };
    this.out.instances.push(instance);
    return instance;
  }

  joint(
    role: string,
    key: string,
    type: Joint["type"],
    host: Id,
    guest: Id,
    params: Record<string, string> = {},
  ): void {
    this.out.joints.push({
      id: this.id(`joint:${key}`),
      type,
      host,
      guest,
      params,
      generatedBy: this.from(role),
    });
  }
}

/** Parenthesised, so it can sit inside a larger expression. */
const wrap = (e: string): string => `(${e})`;

/** Joint parameters from the form's depth options; absent means the spec's default rule applies. */
function depth(value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { depth: value };
}

// ---- case ---------------------------------------------------------------------------------------

function generateCase(b: Builder): void {
  const { size } = b.structure;
  const carcase = b.stock("carcaseStock");
  if (!carcase) return;
  const T = b.thickness(carcase);
  const W = wrap(size.w);
  const H = wrap(size.h);
  const D = wrap(size.d);

  const topBottom = b.option("topBottom") ?? "between-sides";
  if (topBottom !== "between-sides") {
    b.warning(
      "not-built-yet",
      `A case with "${topBottom}" is not built yet; the top and bottom go between the sides.`,
      "topBottom",
    );
  }
  const backStyle = b.option("back") ?? (b.option("backStock") ? "inset-rabbet" : "none");
  if (backStyle !== "none" && backStyle !== "inset-rabbet") {
    b.warning(
      "not-built-yet",
      `A case back of "${backStyle}" is not built yet; the case is built without a back.`,
      "back",
    );
  }
  const backStock = backStyle === "inset-rabbet" ? b.stock("backStock") : undefined;
  const B = backStock ? b.thickness(backStock) : "0in";
  const dado = depth(b.option("dadoDepth"));
  const rabbet = depth(b.option("rabbetDepth"));
  const backRabbet = depth(b.option("backRabbetDepth"));
  const roundover = b.option("shelfRoundover");
  const inner = `${W} - 2*${T}`;

  const sideDef = b.part("side", "side", { name: "Side", stock: carcase.id, length: H, width: D });
  const right = b.instance("side", "side:right", sideDef, ["0in", "0in", "0in"], {
    name: "Right side",
    orientation: 17,
  });
  const left = b.instance("side", "side:left", sideDef, [`${W} - ${T}`, "0in", "0in"], {
    name: "Left side",
    orientation: 23,
    mirrored: true,
  });
  const topDef = b.part("top", "top", {
    name: "Top",
    stock: carcase.id,
    length: inner,
    width: `${D} - ${B}`,
  });
  const bottomDef = b.part("bottom", "bottom", {
    name: "Bottom",
    stock: carcase.id,
    length: inner,
    width: `${D} - ${B}`,
  });
  const top = b.instance("top", "top", topDef, [T, B, `${H} - ${T}`], { name: "Top" });
  const bottom = b.instance("bottom", "bottom", bottomDef, [T, B, "0in"], { name: "Bottom" });

  // Openings (shelves, partitions, bays). Boards in an opening are joined to the board on each side
  // of it, and partitions to the top and bottom.
  const openingJoints: Array<() => void> = [];
  let shelfOpenings = 0;
  let partitions = 0;
  // Names are numbered only when there is more than one of a kind.
  const tally = (o: Opening | undefined): { shelfOpenings: number; partitions: number } => {
    const d = o?.division;
    if (!d) return { shelfOpenings: 0, partitions: 0 };
    let own = { shelfOpenings: 0, partitions: 0 };
    if (d.type === "shelves") own = { shelfOpenings: 1, partitions: 0 };
    else if (d.type === "partition") own = { shelfOpenings: 0, partitions: 1 };
    else {
      const bays = b.count(d.count, "the number of bays");
      own = { shelfOpenings: 0, partitions: Math.max(0, bays - 1) };
    }
    return o.children.map(tally).reduce(
      (sum, c) => ({
        shelfOpenings: sum.shelfOpenings + c.shelfOpenings,
        partitions: sum.partitions + c.partitions,
      }),
      own,
    );
  };
  const planned = tally(b.structure.openings[0]);
  const multiple = planned.shelfOpenings > 1;

  const place = (
    o: Opening | undefined,
    x0: string,
    x1: string,
    leftBoard: Instance,
    rightBoard: Instance,
    key: string,
  ): void => {
    const d = o?.division;
    if (!d) return;
    if (d.type === "shelves") {
      shelfOpenings += 1;
      const name = multiple ? `Shelf ${shelfOpenings}` : "Shelf";
      const def = b.part("shelf", `shelf:${key}`, {
        name,
        stock: carcase.id,
        length: `${wrap(x1)} - ${wrap(x0)}`,
        width: `${D} - ${B}`,
        ops: roundover
          ? [
              {
                id: b.id(`op:shelf:${key}`),
                type: "roundover",
                edges: ["edge1/face0", "edge1/face1"],
                radius: roundover,
              },
            ]
          : [],
      });
      const guests: Id[] = [];
      if (d.spacing === "even") {
        const source = b.instance("shelf", `shelf:${key}`, def, [x0, B, T], { name });
        b.out.patterns.push({
          id: b.id(`pat:shelf:${key}`),
          source: source.id,
          count: d.count,
          axis: "z",
          spacing: { mode: "distribute", from: T, to: `${H} - ${T}` },
          generatedBy: b.from("shelf"),
        });
        guests.push(b.id(`pat:shelf:${key}`));
      } else {
        for (const [n, height] of d.spacing.entries()) {
          const inst = b.instance("shelf", `shelf:${key}:${n}`, def, [x0, B, height], {
            name: `${name} ${n + 1}`,
          });
          guests.push(inst.id);
        }
      }
      for (const [n, guest] of guests.entries()) {
        openingJoints.push(() => {
          b.joint("shelf", `shelf:${key}:${n}:l`, "dado", leftBoard.id, guest, dado);
          b.joint("shelf", `shelf:${key}:${n}:r`, "dado", rightBoard.id, guest, dado);
        });
      }
      return;
    }

    // Partitions: one at a measurement, or bays-1 evenly spaced.
    const split = (offsets: string[], children: Array<[string, string]>): void => {
      const boards: Instance[] = offsets.map((at, n) => {
        partitions += 1;
        const label = planned.partitions > 1 ? `Partition ${partitions}` : "Partition";
        const def = b.part("partition", `partition:${key}:${n}`, {
          name: label,
          stock: carcase.id,
          length: `${H} - 2*${T}`,
          width: `${D} - ${B}`,
        });
        const inst = b.instance(
          "partition",
          `partition:${key}:${n}`,
          def,
          [`${wrap(x0)} + ${wrap(at)}`, B, T],
          { name: label, orientation: 17 },
        );
        openingJoints.push(() => {
          b.joint("partition", `partition:${key}:${n}:bottom`, "dado", bottom.id, inst.id, dado);
          b.joint("partition", `partition:${key}:${n}:top`, "dado", top.id, inst.id, dado);
        });
        return inst;
      });
      for (const [n, [c0, c1]] of children.entries()) {
        const l = n === 0 ? leftBoard : (boards[n - 1] as Instance);
        const r = n === children.length - 1 ? rightBoard : (boards[n] as Instance);
        place(o?.children[n], c0, c1, l, r, `${key}.${n}`);
      }
    };
    if (d.type === "partition") {
      const at = d.at;
      split(
        [at],
        [
          [x0, `${wrap(x0)} + ${wrap(at)}`],
          [`${wrap(x0)} + ${wrap(at)} + ${T}`, x1],
        ],
      );
      return;
    }
    const n = b.count(d.count, "the number of bays");
    if (n < 2) return;
    const w = `(${wrap(x1)} - ${wrap(x0)})`;
    const bay = `(${w} - ${n - 1}*${T})/${n}`;
    const offsets = Array.from({ length: n - 1 }, (_, k) => `${k + 1}*${bay} + ${k}*${T}`);
    const children = Array.from({ length: n }, (_, k): [string, string] => [
      k === 0 ? x0 : `${wrap(x0)} + ${k}*${bay} + ${k}*${T}`,
      k === n - 1 ? x1 : `${wrap(x0)} + ${k + 1}*${bay} + ${k}*${T}`,
    ]);
    split(offsets, children);
  };
  place(b.structure.openings[0], T, `${W} - ${T}`, right, left, "0");

  let back: Instance | undefined;
  if (backStock) {
    const backDef = b.part("back", "back", {
      name: "Back",
      stock: backStock.id,
      length: H,
      width: inner,
    });
    back = b.instance("back", "back", backDef, [T, "0in", "0in"], {
      name: "Back",
      orientation: 16,
    });
  }

  for (const emit of openingJoints) emit();
  for (const [n, [host, guest]] of [
    [right, top],
    [right, bottom],
    [left, top],
    [left, bottom],
  ].entries()) {
    b.joint(
      "carcase",
      `rabbet:${n}`,
      "rabbet",
      (host as Instance).id,
      (guest as Instance).id,
      rabbet,
    );
  }
  if (back) {
    b.joint("back", "back:right", "rabbet", right.id, back.id, backRabbet);
    b.joint("back", "back:left", "rabbet", left.id, back.id, backRabbet);
  }
}

// ---- box ----------------------------------------------------------------------------------------

function generateBox(b: Builder): void {
  const { size } = b.structure;
  const wall = b.stock("wallStock");
  const bottomStock = b.option("bottom") === "none" ? undefined : b.stock("bottomStock");
  if (!wall) return;
  const Tw = b.thickness(wall);
  const L = wrap(size.w);
  const Wd = wrap(size.d);
  const H = wrap(size.h);
  const corner = b.option("cornerJoint") ?? "through-dovetail";
  if (corner !== "through-dovetail") {
    b.warning(
      "not-built-yet",
      `A box corner of "${corner}" is not built yet; the corners are through dovetails.`,
      "cornerJoint",
    );
  }
  const offset = b.option("grooveOffset") ?? "0in";

  const frontDef = b.part("front", "front", { name: "Front", stock: wall.id, length: L, width: H });
  const backDef = b.part("back", "back", { name: "Back", stock: wall.id, length: L, width: H });
  const sideDef = b.part("side", "side", { name: "Side", stock: wall.id, length: Wd, width: H });
  const bottomDef = bottomStock
    ? b.part("bottom", "bottom", {
        name: "Bottom",
        stock: bottomStock.id,
        length: `${L} - 2*${Tw}`,
        width: `${Wd} - 2*${Tw}`,
      })
    : undefined;

  const front = b.instance("front", "front", frontDef, ["0in", "0in", "0in"], {
    name: "Front",
    orientation: 1,
  });
  const sideA = b.instance("side", "side:a", sideDef, ["0in", "0in", "0in"], {
    name: "Side A",
    orientation: 12,
  });
  const back = b.instance("back", "back", backDef, ["0in", `${Wd} - ${Tw}`, "0in"], {
    name: "Back",
    orientation: 3,
  });
  const sideB = b.instance("side", "side:b", sideDef, [`${L} - ${Tw}`, "0in", "0in"], {
    name: "Side B",
    orientation: 8,
  });
  const bottom = bottomDef
    ? b.instance("bottom", "bottom", bottomDef, [Tw, Tw, offset], { name: "Bottom" })
    : undefined;

  const corners: Array<[Instance, Instance, string]> = [
    [front, sideA, "front-a"],
    [front, sideB, "front-b"],
    [back, sideA, "back-a"],
    [back, sideB, "back-b"],
  ];
  for (const [host, guest, key] of corners) {
    b.joint("corner", `corner:${key}`, "throughDovetail", host.id, guest.id, {});
  }
  if (bottom) {
    const groove = depth(b.option("grooveDepth"));
    for (const [wallInstance, key] of [
      [front, "front"],
      [back, "back"],
      [sideA, "a"],
      [sideB, "b"],
    ] as const) {
      b.joint("bottom", `groove:${key}`, "dado", wallInstance.id, bottom.id, groove);
    }
  }
  if (b.flag("grainWraps")) {
    b.out.matchSets.push({
      id: b.id("matchset:wrap"),
      name: "Grain wraps the corners",
      type: "continuousGrain",
      members: [front.id, sideA.id, back.id, sideB.id],
      axis: "length",
      generatedBy: b.from("grain"),
    });
  }
}

// ---- merging ------------------------------------------------------------------------------------

/** Runs the generators. Pure: the same project always gives the same result, ids included. */
export function generate(project: Project): { project: Project; diagnostics: Diagnostic[] } {
  const base = withoutGenerated(project);
  if (project.structures.length === 0) return { project: base, diagnostics: [] };

  const stocks = new Map(project.stock.map((s) => [s.id, s]));
  const diagnostics: Diagnostic[] = [];
  const made = empty();
  let scope: Record<string, unknown> = {};
  try {
    scope = solveModel(base).scope as unknown as Record<string, unknown>;
  } catch {
    scope = {};
  }
  for (const structure of project.structures) {
    const builder = new Builder(structure, stocks, scope);
    if (structure.type === "case") generateCase(builder);
    else generateBox(builder);
    diagnostics.push(...builder.diagnostics);
    made.parts.push(...builder.out.parts);
    made.instances.push(...builder.out.instances);
    made.patterns.push(...builder.out.patterns);
    made.joints.push(...builder.out.joints);
    made.matchSets.push(...builder.out.matchSets);
  }

  const known = <T extends { id: Id }>(have: T[]): Set<Id> => new Set(have.map((x) => x.id));
  const fresh = <T extends { id: Id }>(have: T[], add: T[]): T[] => {
    const ids = known(have);
    return add.filter((x) => !ids.has(x.id));
  };
  // A detached part is kept as saved; so are its placements and patterns.
  const detachedDefs = new Set(base.parts.filter((p) => p.detached).map((p) => p.id));
  const generatedInstances = made.instances.filter((i) => !detachedDefs.has(i.def));
  const generatedPatterns = made.patterns.filter(
    (p) => !detachedDefs.has(made.instances.find((i) => i.id === p.source)?.def ?? ""),
  );
  return {
    project: {
      ...base,
      parts: [...base.parts, ...fresh(base.parts, made.parts)],
      instances: [...base.instances, ...fresh(base.instances, generatedInstances)],
      patterns: [...base.patterns, ...fresh(base.patterns, generatedPatterns)],
      joints: [...base.joints, ...made.joints],
      matchSets: [...base.matchSets, ...made.matchSets],
    },
    diagnostics,
  };
}
