// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The pegboard itself (design spec, §1 "Your shop", the table of rows): power tools, hand tools and
// the wood you build with, each a card to hang, with a hung tool's settings on its card.

import { INCH, type Project, type Stock } from "@kerf/core";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  addWood,
  isHung,
  type PegTool,
  setSettings,
  toggleTool,
  toggleWood,
  type Wall,
} from "../../model/pegboard";
import type { DrawingName } from "../art/drawings";
import type { TipText } from "../Tip";
import { TIPS, woodTip } from "../tips";
import { AddWood } from "./AddWood";
import { RouterSettings } from "./RouterBits";
import { SizeChoice, type UsualSize } from "./SizeChoice";
import { ToolCard } from "./ToolCard";

/** What each tool's card shows: its drawing, its name and what it is for. */
const TOOL_CARDS: Record<
  PegTool,
  { drawing: DrawingName; name: string; use: string; tip: TipText }
> = {
  tableSaw: { drawing: "tableSaw", name: "Table saw", use: "Rips, crosscuts", tip: TIPS.tableSaw },
  dadoStack: {
    drawing: "dadoStack",
    name: "Dado stack",
    use: "Dados, grooves",
    tip: TIPS.dadoStack,
  },
  router: { drawing: "router", name: "Router", use: "Edges, rabbets", tip: TIPS.router },
  trackSaw: { drawing: "trackSaw", name: "Track saw", use: "Sheet breakdown", tip: TIPS.trackSaw },
  drill: { drawing: "drill", name: "Drill / driver", use: "Holes, screws", tip: TIPS.drill },
  chisels: { drawing: "chisels", name: "Chisels", use: "Cleanup, joints", tip: TIPS.chisels },
  dovetailSaw: {
    drawing: "dovetailSaw",
    name: "Dovetail saw",
    use: "Hand joinery",
    tip: TIPS.dovetailSaw,
  },
};

const POWER_TOOLS: readonly PegTool[] = ["tableSaw", "dadoStack", "router", "trackSaw", "drill"];
const HAND_TOOLS: readonly PegTool[] = ["chisels", "dovetailSaw"];

/** A saw's blades (design spec, §1: "standard 1/8", thin 3/32", other"). */
const BLADES: readonly UsualSize[] = [
  { label: 'Standard (1/8")', size: INCH / 8 },
  { label: 'Thin kerf (3/32")', size: (3 * INCH) / 32 },
];

/** A dado stack's widest cut (design spec, §1: "1/2", 3/4", 13/16", other"). */
const DADO_WIDTHS: readonly UsualSize[] = [
  { label: '1/2"', size: INCH / 2 },
  { label: '3/4"', size: (3 * INCH) / 4 },
  { label: '13/16"', size: (13 * INCH) / 16 },
];

/** Plywood this thick or more is case stock; thinner is for backs and bottoms. */
const CASE_SHEET = INCH / 2;

const woodDrawing = (stock: Stock): DrawingName =>
  stock.kind !== "sheet" ? "boards" : stock.thickness >= CASE_SHEET ? "sheet" : "thinSheet";

const woodUse = (stock: Stock): string =>
  stock.kind !== "sheet"
    ? "Solid wood"
    : stock.thickness >= CASE_SHEET
      ? "Cases, shelves"
      : "Backs, bottoms";

type ChangeWall = Dispatch<SetStateAction<Wall>>;

/** The settings a hung tool shows on its card; none for a drill or hand tools. */
function settingsOf(tool: PegTool, wall: Wall, units: Project["units"], change: ChangeWall) {
  const saw = (which: "tableSaw" | "trackSaw"): ReactNode => (
    <SizeChoice
      label="Blade"
      usual={BLADES}
      value={wall.settings[which].kerf}
      units={units}
      otherLabel="Blade width"
      notPositive="A blade must be wider than zero."
      onChange={(kerf) => change((w) => setSettings(w, which, { kerf }))}
    />
  );
  switch (tool) {
    case "tableSaw":
    case "trackSaw":
      return saw(tool);
    case "dadoStack":
      return (
        <SizeChoice
          label="Widest cut"
          usual={DADO_WIDTHS}
          value={wall.settings.dadoStack.maxWidth}
          units={units}
          otherLabel="Widest cut, typed"
          notPositive="The widest cut must be more than zero."
          onChange={(maxWidth) => change((w) => setSettings(w, "dadoStack", { maxWidth }))}
        />
      );
    case "router":
      return (
        <RouterSettings
          bits={wall.settings.router.bits}
          units={units}
          onChange={(bits) => change((w) => setSettings(w, "router", { bits }))}
        />
      );
    default:
      return null;
  }
}

/** One row of the wall: its heading, then its cards. */
function PegRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="peg-section" aria-label={title}>
      <h2 className="peg-row-title">{title}</h2>
      <ul className="peg-row">{children}</ul>
    </section>
  );
}

/**
 * The wall of cards for `wall`. Each tap or setting goes through `change`, so nothing is saved until
 * the screen says so; lengths are typed and shown in `units`.
 */
export function Pegboard({
  wall,
  units,
  change,
}: {
  wall: Wall;
  units: Project["units"];
  change: ChangeWall;
}) {
  const toolCard = (tool: PegTool) => (
    <ToolCard
      key={tool}
      {...TOOL_CARDS[tool]}
      hung={isHung(wall, tool)}
      onToggle={() => change((w) => toggleTool(w, tool))}
    >
      {settingsOf(tool, wall, units, change)}
    </ToolCard>
  );
  return (
    <div className="pegboard">
      <PegRow title="Power tools">{POWER_TOOLS.map(toolCard)}</PegRow>
      <PegRow title="Hand tools">{HAND_TOOLS.map(toolCard)}</PegRow>
      <PegRow title="What you build with">
        {wall.wood.map((stock) => (
          <ToolCard
            key={stock.id}
            drawing={woodDrawing(stock)}
            name={stock.name}
            use={woodUse(stock)}
            tip={woodTip(stock.name)}
            hung={wall.woodHung.has(stock.id)}
            onToggle={() => change((w) => toggleWood(w, stock.id))}
          />
        ))}
        <AddWood units={units} onAdd={(stock) => change((w) => addWood(w, stock))} />
      </PegRow>
    </div>
  );
}
