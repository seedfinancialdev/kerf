// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Cut list (Cut list & nesting, "Outputs"; Domain model v0, invariants).
//
// Grouping key = stock + cut length + cut width + thickness. Match-set members are the only
// exception: they stay together, in order, as a numbered block. Lines are ordered by first
// appearance in the project's part list (ADR 013, decision D6).

import type { Derived } from "../joints/derive";
import { NO_ADD } from "../joints/types";
import type { CutList, CutListBlock, CutListLine } from "../outputs";
import type { SolvedInstance, SolvedModel, SolvedPart } from "../solve/model";
import type { Id, Project } from "../types";

export interface CutPart {
  instance: SolvedInstance;
  part: SolvedPart;
  /** Cut size: finished size plus what joints add. */
  length: number;
  width: number;
  thickness: number;
}

/** Every placed part with its cut size. */
export function cutParts(model: SolvedModel, derived: Derived): CutPart[] {
  const partById = new Map(model.parts.map((p) => [p.id, p]));
  const out: CutPart[] = [];
  for (const instance of model.instances) {
    const part = partById.get(instance.def);
    if (!part) continue;
    const add = derived.instances.get(instance.id)?.add ?? NO_ADD;
    out.push({
      instance,
      part,
      length: part.length + add.length,
      width: part.width + add.width,
      thickness: part.thickness,
    });
  }
  return out;
}

export function buildCutListFrom(project: Project, parts: CutPart[]): CutList {
  const memberOf = new Map<Id, Id>();
  for (const set of project.matchSets) for (const id of set.members) memberOf.set(id, set.id);

  const defOrder = new Map(project.parts.map((p, i) => [p.id, i]));
  const groups = new Map<string, CutPart[]>();
  for (const cut of parts) {
    if (memberOf.has(cut.instance.id)) continue;
    const key = [cut.part.stock, cut.length, cut.width, cut.thickness].join("/");
    const list = groups.get(key) ?? [];
    list.push(cut);
    groups.set(key, list);
  }

  const firstDef = (list: CutPart[]): number =>
    Math.min(...list.map((c) => defOrder.get(c.part.id) ?? Number.MAX_SAFE_INTEGER));
  const ordered = [...groups.values()].sort((a, b) => firstDef(a) - firstDef(b));

  const lines: CutListLine[] = ordered.map((list) => {
    const first = list[0] as CutPart;
    const byDef = new Map<Id, { name: string; quantity: number; order: number }>();
    for (const c of list) {
      const found = byDef.get(c.part.id);
      if (found) found.quantity += 1;
      else
        byDef.set(c.part.id, {
          name: c.part.name,
          quantity: 1,
          order: defOrder.get(c.part.id) ?? 0,
        });
    }
    return {
      stock: first.part.stock,
      length: first.length,
      width: first.width,
      thickness: first.thickness,
      visible: { length: first.part.length, width: first.part.width },
      quantity: list.length,
      parts: [...byDef.values()]
        .sort((a, b) => a.order - b.order)
        .map(({ name, quantity }) => ({ name, quantity })),
    };
  });

  const byInstance = new Map(parts.map((c) => [c.instance.id, c]));
  const blocks: CutListBlock[] = [];
  for (const set of project.matchSets) {
    const members = set.members.map((id) => byInstance.get(id));
    if (members.some((m) => m === undefined)) continue; // a member failed upstream
    blocks.push({
      matchSet: set.id,
      name: set.name,
      members: (members as CutPart[]).map((m, i) => ({
        sequence: i + 1,
        of: members.length,
        name: m.part.name,
        stock: m.part.stock,
        length: m.length,
        width: m.width,
        thickness: m.thickness,
      })),
    });
  }
  return { lines, blocks };
}
