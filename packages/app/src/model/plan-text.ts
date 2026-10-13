// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The build plan in shop words (Interaction spec, "6. The build plan"). Formatting only: every
// number comes from the engine's solve.

import {
  type CutListLine,
  formatLength,
  type MachiningSetup,
  type Project,
  type StockTotals,
} from "@kerf/core";

const TOOL = { dadoStack: "Dado stack", router: "Router", handTools: "Hand tools" } as const;

/** The plural "s" for a count other than one. */
function s(count: number): string {
  return count === 1 ? "" : "s";
}

/** One machining setup as a line, e.g. `Dado stack, 23/32" wide, 1/4" deep: 12 cuts`; `units` sets how lengths read. */
export function setupText(setup: MachiningSetup, units: Project["units"]): string {
  const lacking = setup.missing ? " (you don't have this tool)" : "";
  if (setup.tool === "handTools") {
    return `Hand-cut dovetails: ${setup.cuts} joint${s(setup.cuts)}${lacking}`;
  }
  if (setup.bit) {
    const bit = formatLength(setup.bit.radius, units);
    return `Router, ${bit} roundover bit: ${setup.cuts} edge${s(setup.cuts)}${lacking}`;
  }
  const size = `${formatLength(setup.width, units)} wide, ${formatLength(setup.depth, units)} deep`;
  return `${TOOL[setup.tool]}, ${size}: ${setup.cuts} cut${s(setup.cuts)}${lacking}`;
}

/** A cut list line as four cells: the parts it makes, its stock, the cut size and the visible size. */
export function cutLineText(
  line: CutListLine,
  project: Project,
): { parts: string; stock: string; cut: string; visible: string } {
  const f = (n: number): string => formatLength(n, project.units);
  return {
    parts: line.parts
      .map((p) => (p.quantity > 1 ? `${p.name} × ${p.quantity}` : p.name))
      .join(", "),
    stock: project.stock.find((st) => st.id === line.stock)?.name ?? "",
    cut: `${f(line.length)} × ${f(line.width)} × ${f(line.thickness)}`,
    visible: `${f(line.visible.length)} × ${f(line.visible.width)}${line.visibleVaries ? " (varies)" : ""}`,
  };
}

/** A non-negative rational shown to one decimal place, a half tenth rounding up (1/20 is 0.1), using whole-number arithmetic only. */
function tenths(value: { num: bigint; den: bigint }): string {
  const t = (value.num * 10n + value.den / 2n) / value.den;
  return `${t / 10n}.${t % 10n}`;
}

/** What to buy for one stock, e.g. `3/4 plywood: 3 sheets`. */
export function totalsText(totals: StockTotals, project: Project): string {
  const name = project.stock.find((st) => st.id === totals.stock)?.name ?? "";
  if (totals.sheets !== undefined) return `${name}: ${totals.sheets} sheet${s(totals.sheets)}`;
  const parts = [
    totals.boards !== undefined ? `${totals.boards} board${s(totals.boards)}` : "",
    totals.boardFeet && totals.boardFeet.num !== 0n ? `${tenths(totals.boardFeet)} board feet` : "",
    totals.linearFeet ? `${tenths(totals.linearFeet)} linear feet` : "",
  ].filter((p) => p !== "");
  return `${name}: ${parts.join(", ")}`;
}
