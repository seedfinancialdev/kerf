// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Machining by setup (Cut list & nesting, "Machining by setup"): every derived cut grouped by
// identical tool setup, so each setup is made once and every cut on it happens together.
//
// Setup key: tool + cut width + cut depth (+ bit for profiles). Order: setups follow the cut list
// (sheet goods first), then edge profiles last. A joint the shop profile cannot make still gets
// a setup, labelled with the tool it needs (`missing`).

import type { Derived } from "../joints/derive";
import type { MachinedCut } from "../joints/types";
import type { MachiningSetup } from "../outputs";
import type { CutPart } from "../outputs/cutlist";
import type { Id, Len, Project, ShopProfile } from "../types";

type Tool = ShopProfile["tools"][number];

function toolFor(
  cut: Pick<MachinedCut, "kind" | "width">,
  shop: ShopProfile,
): { tool: MachiningSetup["tool"]; missing: boolean } {
  const of = <T extends Tool["type"]>(type: T): Array<Extract<Tool, { type: T }>> =>
    shop.tools.filter((t): t is Extract<Tool, { type: T }> => t.type === type);

  if (cut.kind === "dovetail") {
    return { tool: "handTools", missing: !of("handTools").some((t) => t.dovetails) };
  }
  if (of("dadoStack").some((t) => t.maxWidth >= cut.width))
    return { tool: "dadoStack", missing: false };
  // An undersized straight bit plus a second pass makes the same cut (Interaction spec).
  if (of("router").some((t) => t.straightBits.some((bit) => bit <= cut.width))) {
    return { tool: "router", missing: false };
  }
  return { tool: "dadoStack", missing: true };
}

export function buildSetups(
  project: Project,
  parts: CutPart[],
  derived: Derived,
  shop: ShopProfile,
): MachiningSetup[] {
  const stockRank = new Map<Id, number>();
  for (const [i, stock] of project.stock.entries()) {
    stockRank.set(stock.id, (stock.kind === "sheet" ? 0 : 1) * 1000 + i);
  }
  const defOrder = new Map(project.parts.map((p, i) => [p.id, i]));
  const partOf = new Map(parts.map((p) => [p.instance.id, p.part]));
  const nameOf = new Map(parts.map((p) => [p.instance.id, p.instance.name]));
  const note = (setup: MachiningSetup, instance: Id): void => {
    const name = nameOf.get(instance) ?? "A part";
    const list = setup.parts ?? [];
    const found = list.find((x) => x.name === name);
    if (found) found.cuts += 1;
    else list.push({ name, cuts: 1 });
    setup.parts = list;
  };

  // Joint cuts in cut-list order: sheet goods first, then by part, then as listed in the project.
  const indexed = derived.machined.map((cut, i) => ({ cut, i }));
  const rank = (host: Id): [number, number] => {
    const part = partOf.get(host);
    return [stockRank.get(part?.stock ?? "") ?? 0, defOrder.get(part?.id ?? "") ?? 0];
  };
  indexed.sort((a, b) => {
    const [sa, da] = rank(a.cut.host);
    const [sb, db] = rank(b.cut.host);
    return sa - sb || da - db || a.i - b.i;
  });

  const setups: MachiningSetup[] = [];
  const index = new Map<string, MachiningSetup>();
  for (const { cut } of indexed) {
    const { tool, missing } = toolFor(cut, shop);
    const dovetail = cut.kind === "dovetail";
    const key = dovetail ? "handTools" : `${tool}|${cut.width}|${cut.depth}`;
    let setup = index.get(key);
    if (!setup) {
      setup = { setup: setups.length + 1, tool, cuts: 0 };
      if (!dovetail) {
        setup.width = cut.width;
        setup.depth = cut.depth;
      }
      if (missing) setup.missing = true;
      index.set(key, setup);
      setups.push(setup);
    }
    setup.cuts += 1;
    note(setup, cut.host);
  }

  // Edge profiles last, grouped by bit.
  const bits = new Map<Len, MachiningSetup>();
  for (const { radius, instance } of derived.roundedEdges) {
    let setup = bits.get(radius);
    if (!setup) {
      const has = shop.tools.some((t) => t.type === "router" && t.roundoverBits.includes(radius));
      setup = {
        setup: setups.length + 1,
        tool: "router",
        bit: { type: "roundover", radius },
        cuts: 0,
      };
      if (!has) setup.missing = true;
      bits.set(radius, setup);
      setups.push(setup);
    }
    setup.cuts += 1;
    note(setup, instance);
  }
  return setups;
}
